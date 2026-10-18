import ctypes
import os
import sys
import time

dll_path = os.path.abspath('server/5868USB.dll')
print(f"Loading {dll_path}...")
dll = ctypes.CDLL(dll_path)
h_mod = dll._handle

g_conv_addr = h_mod + 0x2a71d8
g_conv_ptr = ctypes.c_void_p.from_address(g_conv_addr).value
print(f"g_converter = {hex(g_conv_ptr)}")

# Progress callback
# Signature from disassembly:
# void onProgress(void* this, int* state, int* process, int* total, int* mode)
CB_TYPE = ctypes.CFUNCTYPE(None, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p)

events = []
def my_progress(this, p_state, p_proc, p_tot, p_mode):
    try:
        state = ctypes.c_int.from_address(p_state).value if p_state else -1
        proc = ctypes.c_int.from_address(p_proc).value if p_proc else -1
        tot = ctypes.c_int.from_address(p_tot).value if p_tot else -1
        mode = ctypes.c_int.from_address(p_mode).value if p_mode else -1
        print(f"Progress: state={state}, proc={proc}, tot={tot}, mode={mode}")
        events.append((state, proc, tot, mode))
    except Exception as e:
        print(f"Callback error: {e}")

cb_func = CB_TYPE(my_progress)
sys._cb_func = cb_func

vtable = (ctypes.c_void_p * 8)(
    ctypes.cast(cb_func, ctypes.c_void_p),
    ctypes.cast(cb_func, ctypes.c_void_p),
    ctypes.cast(cb_func, ctypes.c_void_p),
    ctypes.cast(cb_func, ctypes.c_void_p)
)
sys._vtable = vtable

dummy_obj = (ctypes.c_void_p * 4)(ctypes.cast(vtable, ctypes.c_void_p))
sys._dummy_obj = dummy_obj

cb_slot = g_conv_ptr + 0x128
ctypes.c_void_p.from_address(cb_slot).value = ctypes.cast(dummy_obj, ctypes.c_void_p).value
print(f"Set callback at {hex(cb_slot)}")

in_nam = os.path.abspath('server/test_model.nam')
out_clo = os.path.abspath('server/test_out.clo')
in_wav = r'C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\wavs\nam_input_wav.wav'
out_wav = os.path.abspath('server/test_out.wav')

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

print("Starting namConvertCloData...")
ret = dll.namConvertCloData(
    in_nam.encode('utf-8'),
    out_clo.encode('utf-8'),
    in_wav.encode('utf-8'),
    out_wav.encode('utf-8'),
    None,
    None
)
print(f"namConvertCloData returned: {ret}")

for i in range(25):
    time.sleep(1)
    if os.path.exists(out_clo):
        print(f"Second {i+1}: out_clo created! Size: {os.path.getsize(out_clo)}")
    # Check if finished
    if any(ev[0] == 3 for ev in events):
        print("CONVERSION FINISHED EVENT RECEIVED!")
        break

print(f"Total events received: {len(events)}")
