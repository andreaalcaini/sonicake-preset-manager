import ctypes
import os
import sys
import time

dll_path = os.path.abspath('data/vendor/5868USB.dll')
print(f"Loading {dll_path}...")
dll = ctypes.CDLL(dll_path)

in_nam = os.path.abspath('tools/captures/test_model.nam')
out_clo = os.path.abspath('tools/captures/test_out.clo')
in_wav = r'C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\wavs\nam_input_wav.wav'
out_wav = os.path.abspath('tools/captures/test_out.wav')

if os.path.exists(out_clo): os.unlink(out_clo)
if os.path.exists(out_wav): os.unlink(out_wav)

dll.namConvertCloData.argtypes = [
    ctypes.c_char_p,
    ctypes.c_char_p,
    ctypes.c_char_p,
    ctypes.c_char_p,
    ctypes.c_void_p,
    ctypes.c_void_p
]
dll.namConvertCloData.restype = ctypes.c_int

ret = dll.namConvertCloData(
    in_nam.encode('utf-8'),
    out_clo.encode('utf-8'),
    in_wav.encode('utf-8'),
    out_wav.encode('utf-8'),
    None,
    None
)
print(f"Return code: {ret}")

for i in range(25):
    time.sleep(1)
    if os.path.exists(out_clo):
        print(f"Second {i+1}: out_clo found! Size: {os.path.getsize(out_clo)}")
    if os.path.exists(out_wav):
        print(f"Second {i+1}: out_wav found! Size: {os.path.getsize(out_wav)}")
    # Check if cloFile.clo in appdata was modified
    appdata_clo = r'C:\Users\andrea\AppData\Roaming\Sonicake\Sonicake Manager\clo\cloFile.clo'
    if os.path.exists(appdata_clo):
        mtime = os.path.getmtime(appdata_clo)
        if time.time() - mtime < 30:
            print(f"Second {i+1}: appdata clo modified! Size: {os.path.getsize(appdata_clo)}")
