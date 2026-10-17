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
import hashlib
import json
import requests
from flask import Flask, request, jsonify, send_file, Response

app = Flask(__name__)

# --- CORS Middleware ---
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With')
    response.headers.add('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    return response

# --- Directories ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(SCRIPT_DIR, 'cache')
VERIFIED_DIR = os.path.join(SCRIPT_DIR, 'verified')
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(VERIFIED_DIR, exist_ok=True)

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
    """Converts 8,840-byte CLO into 2,696-byte Low Model accepted by Smart Box."""
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

# --- Locate Sonicake C++ Native Library ---
dll_candidates = [
    os.path.join(SCRIPT_DIR, '5868USB.dll'),
    os.path.join(SCRIPT_DIR, 'lib5868USB.so'),
    r'C:\Program Files\Sonicake\Sonicake Manager\assets\5868USB.dll',
    os.environ.get('SONICAKE_LIB_PATH', '')
]

SONICAKE_DLL = None
convert_func = None
err_func = None

for path in dll_candidates:
    if path and os.path.exists(path):
        try:
            SONICAKE_DLL = ctypes.cdll.LoadLibrary(path)
            convert_func = SONICAKE_DLL.convertNamToNambAtPath
            convert_func.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_float]
            convert_func.restype = ctypes.c_int

            if hasattr(SONICAKE_DLL, 'getLastNamToNambError'):
                err_func = SONICAKE_DLL.getLastNamToNambError
                err_func.restype = ctypes.c_char_p

            print(f"[*] Loaded Sonicake native library: {path}")
            break
        except Exception as e:
            print(f"[!] Warning: Failed loading library from {path}: {e}")

def convert_nam_file(in_path, out_path, slim_ratio=1.0):
    if not convert_func:
        raise RuntimeError("Sonicake native compiler library (5868USB.dll) is not loaded.")
    ret = convert_func(in_path.encode('utf-8'), out_path.encode('utf-8'), ctypes.c_float(slim_ratio))
    if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        c_err = ""
        if err_func:
            try:
                raw_err = err_func()
                if raw_err:
                    c_err = raw_err.decode('utf-8', errors='ignore').strip()
            except Exception:
                pass
        err_msg = c_err if c_err else f"Compiler failed (exit code {ret})"
        raise RuntimeError(err_msg)
    return os.path.getsize(out_path)

# --- Routes ---

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "service": "sonicake-bridge-converter",
        "version": "1.1.0",
        "platform": sys.platform,
        "compiler_available": convert_func is not None,
        "cache_entries": len(os.listdir(CACHE_DIR)),
        "verified_models": len(os.listdir(VERIFIED_DIR))
    })

@app.route('/api/convert-nam', methods=['POST', 'OPTIONS'])
def convert_nam():
    if request.method == 'OPTIONS':
        return Response(status=200)

    model_bytes = None
    model_name = "model"

    # 1. Handle JSON body with URL
    if request.is_json:
        data = request.get_json() or {}
        url = data.get('url')
        model_name = data.get('name', 'model')
        if not url:
            return jsonify({"error": "Missing 'url' parameter in JSON payload"}), 400
        try:
            print(f"[*] Fetching Tone model from: {url}")
            resp = requests.get(url, timeout=30)
            if not resp.ok:
                return jsonify({"error": f"Failed to download model from {url} (HTTP {resp.status_code})"}), 502
            model_bytes = resp.content
        except Exception as e:
            return jsonify({"error": f"Error downloading model: {str(e)}"}), 502

    # 2. Handle multipart file upload
    elif 'file' in request.files:
        uploaded = request.files['file']
        model_bytes = uploaded.read()
        model_name = uploaded.filename or "uploaded_model"

    # 3. Handle raw binary upload
    elif request.data:
        model_bytes = request.data
        model_name = request.headers.get('X-File-Name', 'raw_model')

    if not model_bytes:
        return jsonify({"error": "No file or URL provided"}), 400

    # Guard: Detect HTML webpage responses
    stripped = model_bytes.strip()
    if stripped.startswith(b'<') or b'<html' in stripped[:300].lower() or b'<!doctype' in stripped[:300].lower():
        return jsonify({
            "error": "Il link indicato non e un file modello diretto, ma una pagina web HTML. Usa un modello con download diretto o carica il file dal PC."
        }), 400

    file_hash = hashlib.sha256(model_bytes).hexdigest()[:16]
    clean_name = os.path.splitext(os.path.basename(model_name))[0].replace(' ', '_')
    clean_name = "".join(c for c in clean_name if c.isalnum() or c in ('_', '-')) or "model"

    # Case A: Input is CLO neural model (header 'VTSI')
    if model_bytes[:4] == b'VTSI':
        cached_clo = os.path.join(CACHE_DIR, f"{file_hash}_{clean_name}.clo")
        try:
            low_bytes = convert_clo_to_low(model_bytes)
            with open(cached_clo, 'wb') as f:
                f.write(low_bytes)
            print(f"[OK] Converted CLO {clean_name} -> {len(low_bytes)} bytes Low Model")
            return send_file(
                cached_clo,
                mimetype='application/octet-stream',
                as_attachment=True,
                download_name=f"{clean_name}.clo"
            )
        except Exception as e:
            return jsonify({"error": f"Errore conversione CLO: {str(e)}"}), 422

    # Case B: Input is compiled .namb binary (header 'BMAN')
    if model_bytes[:4] == b'BMAN':
        cached_namb = os.path.join(CACHE_DIR, f"{file_hash}_{clean_name}.namb")
        if not os.path.exists(cached_namb):
            with open(cached_namb, 'wb') as f:
                f.write(model_bytes)
        return send_file(
            cached_namb,
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name=f"{clean_name}.namb"
        )

    # Case C: Neural Amp Modeler (.nam) input
    if not convert_func:
        return jsonify({"error": "Sonicake native library is not available on this server"}), 503

    cached_namb = os.path.join(CACHE_DIR, f"{file_hash}_{clean_name}.namb")
    if not os.path.exists(cached_namb):
        with tempfile.NamedTemporaryFile(suffix='.nam', delete=False) as tmp_in:
            tmp_in_path = tmp_in.name
            tmp_in.write(model_bytes)

        try:
            convert_nam_file(tmp_in_path, cached_namb, slim_ratio=1.0)
            print(f"[OK] Converted NAM {clean_name} -> {os.path.getsize(cached_namb)} bytes")
        except Exception as e:
            print(f"[!] Compilation error for '{clean_name}': {e}")
            return jsonify({"error": f"Errore compilazione NAM: {str(e)}"}), 422
        finally:
            if os.path.exists(tmp_in_path):
                try: os.unlink(tmp_in_path)
                except: pass

    return send_file(
        cached_namb,
        mimetype='application/octet-stream',
        as_attachment=True,
        download_name=f"{clean_name}.namb"
    )

SONICAKE_APPDATA_CLO = r'C:\Users\andrea\AppData\Roaming\Sonicake\Sonicake Manager\clo\cloFile.clo'
SONICAKE_APPDATA_LOG = r'C:\Users\andrea\AppData\Roaming\Sonicake\Sonicake Manager\logs\tone_import.log'

def get_latest_imported_tone_name():
    if os.path.exists(SONICAKE_APPDATA_LOG):
        try:
            with open(SONICAKE_APPDATA_LOG, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
            for line in reversed(lines):
                if 'toneName=' in line:
                    part = line.split('toneName=')[1].split(',')[0].strip()
                    if part: return part
                if 'selected NAM file path=' in line and 'name=' in line:
                    part = line.split('name=')[1].split(',')[0].replace('.nam', '').strip()
                    if part: return part
        except Exception:
            pass
    return "Clone Model"

@app.route('/api/latest-clo', methods=['GET', 'OPTIONS'])
def latest_clo_endpoint():
    """Returns the latest CLO model imported in Sonicake Manager, converted to Low Model."""
    if request.method == 'OPTIONS':
        return Response(status=200)

    if not os.path.exists(SONICAKE_APPDATA_CLO):
        return jsonify({"error": "Nessun file CLO trovato in Sonicake Manager AppData."}), 404

    try:
        with open(SONICAKE_APPDATA_CLO, 'rb') as f:
            raw_clo = f.read()

        low_bytes = convert_clo_to_low(raw_clo)
        out_path = os.path.join(CACHE_DIR, 'latest_imported_clone.clo')
        with open(out_path, 'wb') as f:
            f.write(low_bytes)

        if request.args.get('info') == '1':
            return jsonify({
                "available": True,
                "toneName": get_latest_imported_tone_name(),
                "originalSize": len(raw_clo),
                "lowModelSize": len(low_bytes),
                "crc": hex(struct.unpack_from('<H', low_bytes, 8)[0])
            })

        return send_file(
            out_path,
            mimetype='application/octet-stream',
            as_attachment=True,
            download_name="latest_clone.clo"
        )
    except Exception as e:
        return jsonify({"error": f"Errore lettura ultimo CLO: {str(e)}"}), 500

@app.route('/api/verified-models', methods=['GET', 'OPTIONS'])
def verified_models_list():
    """Lists pre-compiled models guaranteed to work without freezing."""
    if request.method == 'OPTIONS':
        return Response(status=200)

    models = [
        {
            "id": "petersburg_thunder",
            "name": "Petersburg Thunder Drizzle",
            "description": "Boutique Russian Tube Amp - Crunch / Lead dinamico e definito",
            "size": 2696,
            "url": "/api/verified-models/petersburg_thunder.clo"
        },
        {
            "id": "slow30_high_gain",
            "name": "Audio Assault Slow30 High Gain",
            "description": "Slo-100 Modded High Gain Metal - Lead fluido e ricco di armoniche",
            "size": 2696,
            "url": "/api/verified-models/slow30_high_gain.clo"
        },
        {
            "id": "marshall_1959",
            "name": "Marshall 1959 Super Lead",
            "description": "Vintage Plexi Super Lead (BJA Super Bowl Setting) - Punch leggendario",
            "size": 2696,
            "url": "/api/verified-models/marshall_1959.clo"
        }
    ]
    return jsonify(models)

@app.route('/api/verified-models/<filename>', methods=['GET'])
def get_verified_model_file(filename):
    clean = os.path.basename(filename)
    path = os.path.join(VERIFIED_DIR, clean)
    if not os.path.exists(path):
        if not clean.endswith('.clo'):
            path += '.clo'
    if os.path.exists(path):
        return send_file(path, mimetype='application/octet-stream', as_attachment=True, download_name=clean)
    return jsonify({"error": f"Modello '{clean}' non trovato"}), 404

@app.route('/api/hardware-slots', methods=['GET', 'OPTIONS'])
def hardware_slots_endpoint():
    if request.method == 'OPTIONS':
        return Response(status=200)
    data = {
        "cloneSlots": ["Petersburg Thunder", "Audio Assault Slow30", "Slot 3 (Libero)", "Slot 4 (Libero)", "Slot 5 (Libero)"],
        "irSlots": ["BlendOfAll", "User IR 2", "User IR 3", "User IR 4", "User IR 5"]
    }
    return jsonify(data)

ACTIVE_PRESET_FILE = os.path.join(CACHE_DIR, 'active_preset.json')

@app.route('/api/active-preset', methods=['GET', 'POST', 'OPTIONS'])
def active_preset_endpoint():
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


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"==================================================")
    print(f"  Sonicake Auto-Sync Converter Microservice v1.1")
    print(f"  Running on: http://0.0.0.0:{port}")
    print(f"  Compiler Available: {convert_func is not None}")
    print(f"==================================================")
    app.run(host='0.0.0.0', port=port, debug=False)
