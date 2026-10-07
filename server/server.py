#!/usr/bin/env python3
"""
Sonicake Cloud/Local Auto-Sync & Compilation Bridge Microservice
Converts Neural Amp Modeler (.nam) files into hardware-ready Sonicake (.namb) binaries
and prepares Cabinet IR (.wav) profiles for direct flashing into Sonicake hardware slots.
"""

import os
import sys
import ctypes
import tempfile
import hashlib
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

# --- Locate Sonicake C++ Native Library ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(SCRIPT_DIR, 'cache')
os.makedirs(CACHE_DIR, exist_ok=True)

dll_candidates = [
    os.path.join(SCRIPT_DIR, '5868USB.dll'),
    os.path.join(SCRIPT_DIR, 'lib5868USB.so'),
    r'C:\Program Files\Sonicake\Sonicake Manager\assets\5868USB.dll',
    os.environ.get('SONICAKE_LIB_PATH', '')
]

SONICAKE_DLL = None
convert_func = None

for path in dll_candidates:
    if path and os.path.exists(path):
        try:
            SONICAKE_DLL = ctypes.cdll.LoadLibrary(path)
            # Signature: int convertNamToNambAtPath(const char* inPath, const char* outPath, float slimRatio)
            convert_func = SONICAKE_DLL.convertNamToNambAtPath
            convert_func.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_float]
            convert_func.restype = ctypes.c_int
            print(f"[*] Loaded Sonicake native library: {path}")
            break
        except Exception as e:
            print(f"[!] Warning: Failed loading library from {path}: {e}")

# --- Helper Functions ---
def convert_nam_file(in_path, out_path, slim_ratio=1.0):
    if not convert_func:
        raise RuntimeError("Sonicake native compiler library (5868USB.dll / lib5868USB.so) is not loaded.")
    ret = convert_func(in_path.encode('utf-8'), out_path.encode('utf-8'), ctypes.c_float(slim_ratio))
    if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
        raise RuntimeError(f"Compiler failed to generate .namb (exit code {ret})")
    return os.path.getsize(out_path)

# --- Routes ---

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "service": "sonicake-bridge-converter",
        "version": "1.0.0",
        "platform": sys.platform,
        "compiler_available": convert_func is not None,
        "cache_entries": len(os.listdir(CACHE_DIR))
    })

@app.route('/api/convert-nam', methods=['POST', 'OPTIONS'])
def convert_nam():
    if request.method == 'OPTIONS':
        return Response(status=200)

    if not convert_func:
        return jsonify({"error": "Sonicake native library is not available on this server"}), 503

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
            print(f"[*] Fetching Tone3000 model from: {url}")
            resp = requests.get(url, timeout=30)
            if not resp.ok:
                return jsonify({"error": f"Failed to download model from {url} (HTTP {resp.status_code})"}), 502
            model_bytes = resp.content
        except Exception as e:
            return jsonify({"error": f"Error downloading model: {str(e)}"}), 500

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

    # Calculate hash for caching
    file_hash = hashlib.sha256(model_bytes).hexdigest()[:16]
    clean_name = os.path.splitext(os.path.basename(model_name))[0].replace(' ', '_')
    cached_namb = os.path.join(CACHE_DIR, f"{file_hash}_{clean_name}.namb")

    if not os.path.exists(cached_namb):
        with tempfile.NamedTemporaryFile(suffix='.nam', delete=False) as tmp_in:
            tmp_in_path = tmp_in.name
            tmp_in.write(model_bytes)

        try:
            convert_nam_file(tmp_in_path, cached_namb, slim_ratio=1.0)
            print(f"[OK] Converted {clean_name} -> {os.path.getsize(cached_namb)} bytes")
        finally:
            if os.path.exists(tmp_in_path):
                try: os.unlink(tmp_in_path)
                except: pass

    # Check magic header
    with open(cached_namb, 'rb') as f:
        magic = f.read(4)
        if magic != b'BMAN':
            return jsonify({"error": f"Invalid header generated: {magic}"}), 500

    # Return as octet-stream download
    return send_file(
        cached_namb,
        mimetype='application/octet-stream',
        as_attachment=True,
        download_name=f"{clean_name}.namb"
    )

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    print(f"==================================================")
    print(f"  Sonicake Auto-Sync Converter Microservice v1.0")
    print(f"  Running on: http://0.0.0.0:{port}")
    print(f"  Compiler Available: {convert_func is not None}")
    print(f"==================================================")
    app.run(host='0.0.0.0', port=port, debug=False)
