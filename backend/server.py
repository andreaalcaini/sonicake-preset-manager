#!/usr/bin/env python3
"""
Sonicake Cloud/Local Auto-Sync & Compilation Bridge Microservice
Converts Neural Amp Modeler (.nam) files and Clone AMP (.clo) profiles
into hardware-ready binaries for direct flashing into Sonicake hardware slots.
"""

import os
import sys
import ctypes
import struct
import tempfile
import io
import re
import json
import threading
import time
from flask import Flask, request, jsonify, send_file, Response
from werkzeug.exceptions import RequestEntityTooLarge

app = Flask(__name__)

# --- Limits for the public server ---
# The server never downloads models: the browser sends the file (local, or downloaded from
# TONE3000 with the user's own login)
MAX_MODEL_BYTES = int(os.environ.get('MAX_MODEL_MB', '25')) * 1024 * 1024
app.config['MAX_CONTENT_LENGTH'] = MAX_MODEL_BYTES + 64 * 1024  # uploads (+ multipart overhead)

# --- CORS: the site calls /api on its own origin; other origins only when listed ---
CORS_ORIGINS = {o.strip() for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip()}

# --- Old public hostnames: permanent redirect to the new one ("old=new,old2=new") ---
HOST_REDIRECTS = dict(
    pair.strip().lower().split('=', 1)
    for pair in os.environ.get('HOST_REDIRECTS', '').split(',') if '=' in pair
)

@app.before_request
def redirect_old_hostnames():
    host = (request.host or '').split(':')[0].lower()
    target = HOST_REDIRECTS.get(host)
    if not target:
        return None
    query = request.query_string.decode('latin-1')
    # 301 for page loads, 308 keeps the method and body of API calls
    return Response(status=301 if request.method in ('GET', 'HEAD') else 308,
                    headers={'Location': f"https://{target}{request.path}{'?' + query if query else ''}"})

@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin and (origin in CORS_ORIGINS or '*' in CORS_ORIGINS):
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type,X-File-Name'
        response.headers['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS'
    return response

@app.errorhandler(RequestEntityTooLarge)
def too_large(_err):
    return jsonify({"error": f"File troppo grande (massimo {MAX_MODEL_BYTES // (1024 * 1024)} MB)."}), 413

# --- Directories ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# DATA_DIR is the persistent volume (/app/data in Docker, the repository's data/ in development):
# vendor files + cache/, the working folder of the conversions (temporary files only)
DATA_DIR = os.environ.get('DATA_DIR', os.path.join(os.path.dirname(SCRIPT_DIR), 'data'))
CACHE_DIR = os.path.join(DATA_DIR, 'cache')
try:
    os.makedirs(CACHE_DIR, exist_ok=True)
    if not os.access(CACHE_DIR, os.W_OK):
        raise PermissionError(CACHE_DIR)
except OSError as e:
    # e.g. host volume owned by root while the container runs as uid 1001
    print(f"[!] Cache non scrivibile ({e}): uso una cache temporanea. Esegui: chown -R 1001:1001 data")
    CACHE_DIR = os.path.join(tempfile.gettempdir(), 'sonicake-cache')
    os.makedirs(CACHE_DIR, exist_ok=True)

# Older versions kept every converted model here (<16 hex hash>_<name>.clo / .namb). Models can
# come from TONE3000, whose API terms forbid caching or hosting catalog content: remove them.
_LEGACY_CACHE = re.compile(r'^[0-9a-f]{16}_.+\.(clo|namb)$')
for _entry in os.listdir(CACHE_DIR):
    if _LEGACY_CACHE.match(_entry):
        try: os.unlink(os.path.join(CACHE_DIR, _entry))
        except OSError: pass
# Built frontend (Vite dist/) served by this same process in the production image
STATIC_DIR = os.environ.get('STATIC_DIR', '')
# Developer-only endpoints (/api/active-preset): off on the production image unless asked for
DEV_ENDPOINTS = os.environ.get('SONICAKE_DEV_ENDPOINTS', '0' if STATIC_DIR else '1') == '1'

# --- Sonicake CRC16 & CLO Converter ---
CRC16_T1 = bytes([
    0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
    0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
    0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
    0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
    0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
    0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
    0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
    0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
    0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
    0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
    0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
    0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
    0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
    0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
    0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40, 0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41,
    0x00, 0xC1, 0x81, 0x40, 0x01, 0xC0, 0x80, 0x41, 0x01, 0xC0, 0x80, 0x41, 0x00, 0xC1, 0x81, 0x40,
])

CRC16_T2 = bytes([
    0x00, 0xC0, 0xC1, 0x01, 0xC3, 0x03, 0x02, 0xC2, 0xC6, 0x06, 0x07, 0xC7, 0x05, 0xC5, 0xC4, 0x04,
    0xCC, 0x0C, 0x0D, 0xCD, 0x0F, 0xCF, 0xCE, 0x0E, 0x0A, 0xCA, 0xCB, 0x0B, 0xC9, 0x09, 0x08, 0xC8,
    0xD8, 0x18, 0x19, 0xD9, 0x1B, 0xDB, 0xDA, 0x1A, 0x1E, 0xDE, 0xDF, 0x1F, 0xDD, 0x1D, 0x1C, 0xDC,
    0x14, 0xD4, 0xD5, 0x15, 0xD7, 0x17, 0x16, 0xD6, 0xD2, 0x12, 0x13, 0xD3, 0x11, 0xD1, 0xD0, 0x10,
    0xF0, 0x30, 0x31, 0xF1, 0x33, 0xF3, 0xF2, 0x32, 0x36, 0xF6, 0xF7, 0x37, 0xF5, 0x35, 0x34, 0xF4,
    0x3C, 0xFC, 0xFD, 0x3D, 0xFF, 0x3F, 0x3E, 0xFE, 0xFA, 0x3A, 0x3B, 0xFB, 0x39, 0xF9, 0xF8, 0x38,
    0x28, 0xE8, 0xE9, 0x29, 0xEB, 0x2B, 0x2A, 0xEA, 0xEE, 0x2E, 0x2F, 0xEF, 0x2D, 0xED, 0xEC, 0x2C,
    0xE4, 0x24, 0x25, 0xE5, 0x27, 0xE7, 0xE6, 0x26, 0x22, 0xE2, 0xE3, 0x23, 0xE1, 0x21, 0x20, 0xE0,
    0xA0, 0x60, 0x61, 0xA1, 0x63, 0xA3, 0xA2, 0x62, 0x66, 0xA6, 0xA7, 0x67, 0xA5, 0x65, 0x64, 0xA4,
    0x6C, 0xAC, 0xAD, 0x6D, 0xAF, 0x6F, 0x6E, 0xAE, 0xAA, 0x6A, 0x6B, 0xAB, 0x69, 0xA9, 0xA8, 0x68,
    0x78, 0xB8, 0xB9, 0x79, 0xBB, 0x7B, 0x7A, 0xBA, 0xBE, 0x7E, 0x7F, 0xBF, 0x7D, 0xBD, 0xBC, 0x7C,
    0xB4, 0x74, 0x75, 0xB5, 0x77, 0xB7, 0xB6, 0x76, 0x72, 0xB2, 0xB3, 0x73, 0xB1, 0x71, 0x70, 0xB0,
    0x50, 0x90, 0x91, 0x51, 0x93, 0x53, 0x52, 0x92, 0x96, 0x56, 0x57, 0x97, 0x55, 0x95, 0x94, 0x54,
    0x9C, 0x5C, 0x5D, 0x9D, 0x5F, 0x9F, 0x9E, 0x5E, 0x5A, 0x9A, 0x9B, 0x5B, 0x99, 0x59, 0x58, 0x98,
    0x88, 0x48, 0x49, 0x89, 0x4B, 0x8B, 0x8A, 0x4A, 0x4E, 0x8E, 0x8F, 0x4F, 0x8D, 0x4D, 0x4C, 0x8C,
    0x44, 0x84, 0x85, 0x45, 0x87, 0x47, 0x46, 0x86, 0x82, 0x42, 0x43, 0x83, 0x41, 0x81, 0x80, 0x40,
])

def calc_sonicake_crc16(data):
    """Exact CRC16 calculation starting from offset 12 of CLO neural models."""
    cl = 0xFF
    r10 = 0xFF
    for b in data:
        edx = b ^ cl
        cl = CRC16_T1[edx] ^ r10
        r10 = CRC16_T2[edx]
    return ((cl << 8) | r10) & 0xFFFF

def convert_clo_to_low(clo_data):
    """Converts 8,840-byte CLO into 2,696-byte Low Model accepted by the pedal."""
    if len(clo_data) == 2696:
        return clo_data
    if len(clo_data) != 8840:
        raise ValueError(f"Formato CLO non valido ({len(clo_data)} byte). Attesi 8840 o 2696 byte.")
    low = bytearray(clo_data[:2696])
    struct.pack_into('<I', low, 4, 2696)
    struct.pack_into('<I', low, 0x14, 2560)
    struct.pack_into('<I', low, 0x84, 512)
    crc = calc_sonicake_crc16(low[12:])
    struct.pack_into('<H', low, 8, crc)
    low[10:12] = b'\x00\x00'
    return bytes(low)

def validate_clo(clo_data):
    """Mirrors Sonicake Manager TcHelper.checkTcFile: magic, declared size, CRC16 from offset 12."""
    if len(clo_data) < 12 or clo_data[:4] != b'VTSI':
        raise ValueError("CLO non valido: magic VTSI assente.")
    declared = struct.unpack_from('<I', clo_data, 4)[0]
    if declared != len(clo_data):
        raise ValueError(f"CLO non valido: dimensione dichiarata {declared} != {len(clo_data)} byte.")
    file_crc = struct.unpack_from('<H', clo_data, 8)[0]
    calc_crc = calc_sonicake_crc16(clo_data[12:])
    if file_crc != calc_crc:
        raise ValueError(f"CLO non valido: CRC16 {calc_crc:#06x} != {file_crc:#06x}.")

# --- Locate Sonicake C++ Native Library ---
# Sonicake Manager's own library: proprietary, never in the repository. Taken from the local
# Sonicake Manager installation, or copied into data/vendor/ (like the ARM64 vendor files).
dll_candidates = [
    os.environ.get('SONICAKE_LIB_PATH', ''),
    os.path.join(DATA_DIR, 'vendor', '5868USB.dll'),
    r'C:\Program Files\Sonicake\Sonicake Manager\assets\5868USB.dll',
]

# Excitation signal Sonicake Manager plays through the NAM model before fitting the CLO
nam_wav_candidates = [
    os.environ.get('SONICAKE_NAM_INPUT_WAV', ''),
    os.path.join(SCRIPT_DIR, 'assets', 'nam_input_wav.wav'),
    r'C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\wavs\nam_input_wav.wav',
    os.path.join(os.environ.get('APPDATA', ''), 'Sonicake', 'Sonicake Manager', 'wavs', 'nam_input_wav.wav'),
]
NAM_INPUT_WAV = next((p for p in nam_wav_candidates if p and os.path.exists(p)), None)

SONICAKE_DLL = None
clo_convert_func = None
clo_err_func = None

for path in dll_candidates:
    if path and os.path.exists(path):
        try:
            SONICAKE_DLL = ctypes.cdll.LoadLibrary(path)
            # Reverse engineered from 5868USB.dll + Sonicake Manager tone_import.log:
            # int namConvertCloDataWithProcess(void* ctx, const char* inWav, const char* outWav,
            #     const char* namPath, uint8_t* cloOut, int* outSize, int* progress, int* total)
            # Returns 8840 immediately and converts on a worker thread. ctx is a scratch object
            # (zeroed block); *outSize becomes 8840 on success, progress/total become -2 on error.
            clo_convert_func = SONICAKE_DLL.namConvertCloDataWithProcess
            clo_convert_func.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_char_p,
                                         ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
            clo_convert_func.restype = ctypes.c_int
            clo_err_func = SONICAKE_DLL.getNamConvertCloErrorMessage
            clo_err_func.restype = ctypes.c_char_p
            print(f"[*] Loaded Sonicake native library: {path}")
            break
        except Exception as e:
            print(f"[!] Warning: Failed loading library from {path}: {e}")

CLO_SIZE = 8840
clo_convert_lock = threading.Lock()  # the DLL keeps a single global conversion state

# Linux ARM64 backend: vendor Android library run through nam2clo (see Dockerfile / nam2clo/)
NAM2CLO_BIN = os.environ.get('NAM2CLO_BIN', '')
NAM2CLO_LIB = os.environ.get('NAM2CLO_LIB', '')
# The vendor library is ARM64-only: on amd64 images the compiler simply reports offline
import platform
NAM2CLO_AVAILABLE = bool(
    platform.machine().lower() in ('aarch64', 'arm64')
    and NAM2CLO_BIN and NAM2CLO_LIB and os.path.exists(NAM2CLO_BIN) and os.path.exists(NAM2CLO_LIB)
)
# Each conversion is its own process, so several can run in parallel (bounded by CPU cores)
nam2clo_slots = threading.BoundedSemaphore(max(1, int(os.environ.get('NAM2CLO_WORKERS', '2'))))

COMPILER_BACKEND = 'dll' if clo_convert_func else ('nam2clo' if NAM2CLO_AVAILABLE else None)
COMPILER_AVAILABLE = COMPILER_BACKEND is not None and NAM_INPUT_WAV is not None

CONVERT_TIMEOUT = int(os.environ.get('NAM2CLO_TIMEOUT', '180'))

def convert_nam_to_clo(nam_path, timeout=None):
    """NAM -> Sonicake CLO (8,840 bytes) with whichever backend this host supports."""
    timeout = timeout or CONVERT_TIMEOUT
    if not NAM_INPUT_WAV:
        raise RuntimeError("nam_input_wav.wav non trovato: imposta SONICAKE_NAM_INPUT_WAV.")
    if COMPILER_BACKEND == 'dll':
        return _convert_with_dll(nam_path, timeout)
    if COMPILER_BACKEND == 'nam2clo':
        return _convert_with_nam2clo(nam_path, timeout)
    raise RuntimeError("Nessun convertitore NAM disponibile su questo server.")

def _convert_with_nam2clo(nam_path, timeout):
    import subprocess
    lib_dir = os.path.dirname(NAM2CLO_LIB)
    env = dict(os.environ, LD_LIBRARY_PATH=f"{lib_dir}:{os.path.dirname(NAM2CLO_BIN)}:/system/lib64")
    with nam2clo_slots:
        fd, out_path = tempfile.mkstemp(suffix='.clo', dir=CACHE_DIR)
        os.close(fd)
        try:
            proc = subprocess.run(
                [NAM2CLO_BIN, NAM2CLO_LIB, NAM_INPUT_WAV, nam_path, out_path, str(timeout)],
                env=env, capture_output=True, text=True, timeout=timeout + 30
            )
            if proc.returncode != 0:
                detail = (proc.stderr or '').strip().splitlines()
                raise RuntimeError(detail[-1] if detail else f"nam2clo exit code {proc.returncode}")
            with open(out_path, 'rb') as f:
                clo = f.read()
            validate_clo(clo)
            return clo
        except subprocess.TimeoutExpired:
            raise RuntimeError("Timeout conversione NAM -> CLO.")
        finally:
            try: os.unlink(out_path)
            except OSError: pass

def _convert_with_dll(nam_path, timeout):
    """Windows: Sonicake Manager's 5868USB.dll, in-process."""
    with clo_convert_lock:
        ctx = (ctypes.c_uint8 * 0x1000)()
        out = (ctypes.c_uint8 * CLO_SIZE)()
        out_size, progress, total = ctypes.c_int(0), ctypes.c_int(0), ctypes.c_int(0)
        fd, out_wav = tempfile.mkstemp(suffix='.wav', dir=CACHE_DIR)
        os.close(fd)
        try:
            clo_convert_func(ctypes.addressof(ctx), NAM_INPUT_WAV.encode('mbcs'), out_wav.encode('mbcs'),
                             nam_path.encode('mbcs'), ctypes.addressof(out), ctypes.addressof(out_size),
                             ctypes.addressof(progress), ctypes.addressof(total))
            deadline = time.time() + timeout
            while out_size.value != CLO_SIZE:
                if progress.value == -2 or total.value == -2:
                    msg = (clo_err_func() or b'').decode('utf-8', errors='ignore').strip()
                    raise RuntimeError(msg or "Conversione NAM -> CLO fallita.")
                if time.time() > deadline:
                    # Worker still owns ctx/out: keep them alive instead of freeing under it
                    _abandoned_buffers.append((ctx, out, out_size, progress, total))
                    raise RuntimeError("Timeout conversione NAM -> CLO.")
                time.sleep(0.1)
            # Worker writes the buffer before publishing the size; give it a beat to finish teardown
            time.sleep(0.3)
            clo = bytes(out)
            validate_clo(clo)
            return clo
        finally:
            try: os.unlink(out_wav)
            except OSError: pass

_abandoned_buffers = []

# --- Routes ---

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "service": "sonicake-bridge-converter",
        "version": "1.1.0",
        "platform": sys.platform,
        "compiler_available": COMPILER_AVAILABLE,
        "compiler_backend": COMPILER_BACKEND
    })

@app.route('/api/convert-nam', methods=['POST', 'OPTIONS'])
def convert_nam():
    if request.method == 'OPTIONS':
        return Response(status=200)

    model_bytes = None
    model_name = "model"

    # Models arrive as files only: the server never downloads URLs
    if request.is_json:
        return jsonify({"error": "Invia il file .nam: il server non scarica modelli da indirizzi web."}), 400

    # 1. Multipart file upload
    if 'file' in request.files:
        uploaded = request.files['file']
        model_bytes = uploaded.read()
        model_name = uploaded.filename or "uploaded_model"

    # 2. Raw binary upload
    elif request.data:
        model_bytes = request.data
        model_name = request.headers.get('X-File-Name', 'raw_model')

    if not model_bytes:
        return jsonify({"error": "Nessun file .nam ricevuto."}), 400

    # Guard: a web page instead of a model file
    stripped = model_bytes.strip()
    if stripped.startswith(b'<') or b'<html' in stripped[:300].lower() or b'<!doctype' in stripped[:300].lower():
        return jsonify({
            "error": "Il file ricevuto non e un modello NAM ma una pagina web HTML."
        }), 400

    clean_name = os.path.splitext(os.path.basename(model_name))[0].replace(' ', '_')
    clean_name = "".join(c for c in clean_name if c.isalnum() or c in ('_', '-')) or "model"

    # Nothing is kept on the server: models (also the ones a user downloads from TONE3000, whose
    # API terms forbid caching or hosting catalog content) only pass through a temporary file
    # that is deleted right after the conversion, and the result is answered from memory
    def reply(data, ext):
        return send_file(io.BytesIO(data), mimetype='application/octet-stream',
                         as_attachment=True, download_name=f"{clean_name}{ext}")

    # Case A: Input is CLO neural model (header 'VTSI')
    if model_bytes[:4] == b'VTSI':
        try:
            low_bytes = convert_clo_to_low(model_bytes)
            print(f"[OK] Converted CLO {clean_name} -> {len(low_bytes)} bytes Low Model")
            return reply(low_bytes, '.clo')
        except Exception as e:
            return jsonify({"error": f"Errore conversione CLO: {str(e)}"}), 422

    # Case B: Input is compiled .namb binary (header 'BMAN'): answered as is
    if model_bytes[:4] == b'BMAN':
        return reply(model_bytes, '.namb')

    # Case C: Neural Amp Modeler (.nam) input -> CLO 8,840 -> Low Model 2,696 (same pipeline as Sonicake Manager)
    if not COMPILER_AVAILABLE:
        return jsonify({"error": "Convertitore NAM momentaneamente non disponibile."}), 503

    fd, tmp_in_path = tempfile.mkstemp(suffix='.nam', dir=CACHE_DIR)
    with os.fdopen(fd, 'wb') as tmp_in:
        tmp_in.write(model_bytes)
    try:
        t0 = time.time()
        clo = convert_nam_to_clo(tmp_in_path)
        low_bytes = convert_clo_to_low(clo)
        print(f"[OK] Converted NAM {clean_name} -> CLO {len(clo)} -> Low Model {len(low_bytes)} bytes in {time.time() - t0:.1f}s")
    except Exception as e:
        print(f"[!] NAM -> CLO conversion error for '{clean_name}': {e}")
        return jsonify({"error": f"Errore conversione NAM: {str(e)}"}), 422
    finally:
        try: os.unlink(tmp_in_path)
        except OSError: pass

    return reply(low_bytes, '.clo')

ACTIVE_PRESET_FILE = os.path.join(CACHE_DIR, 'active_preset.json')

@app.route('/api/active-preset', methods=['GET', 'POST', 'OPTIONS'])
def active_preset_endpoint():
    # Local debugging aid: the published site never calls it
    if not DEV_ENDPOINTS:
        return jsonify({"error": "Not found"}), 404
    if request.method == 'OPTIONS':
        return Response(status=200)

    if request.method == 'POST':
        data = request.get_json() or {}
        try:
            with open(ACTIVE_PRESET_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print(f"[PRESET SYNC] Slot {data.get('slot')} ({data.get('name')}) - Amp: {data.get('ampName')}")
        except Exception as e:
            print(f"[!] Error saving active preset: {e}")
        return jsonify({"status": "ok", "slot": data.get('slot')})

    # GET
    if os.path.exists(ACTIVE_PRESET_FILE):
        try:
            with open(ACTIVE_PRESET_FILE, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except Exception:
            pass
    return jsonify({"slot": None, "name": None, "ampName": None})


# --- Static frontend (production image only) ---
if STATIC_DIR and os.path.isdir(STATIC_DIR):
    from flask import send_from_directory

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def frontend(path):
        if path.startswith('api/'):
            return jsonify({"error": "Not found"}), 404
        full = os.path.join(STATIC_DIR, path)
        if path and os.path.isfile(full):
            return send_from_directory(STATIC_DIR, path)
        return send_from_directory(STATIC_DIR, 'index.html')


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"==================================================")
    print(f"  Sonicake Auto-Sync Converter Microservice v1.1")
    print(f"  Running on: http://0.0.0.0:{port}")
    print(f"  NAM -> CLO Converter: {COMPILER_BACKEND or 'non disponibile'}")
    print(f"  NAM input WAV: {NAM_INPUT_WAV}")
    print(f"==================================================")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
