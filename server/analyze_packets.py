import ctypes
from ctypes import wintypes
import time

winmm = ctypes.windll.winmm
CALLBACK_FUNCTION = 0x00030000
MIM_LONGDATA = 0x3C4

class MIDIHDR(ctypes.Structure):
    _fields_ = [
        ('lpData', ctypes.POINTER(ctypes.c_char)),
        ('dwBufferLength', wintypes.DWORD),
        ('dwBytesRecorded', wintypes.DWORD),
        ('dwUser', ctypes.c_size_t),
        ('dwFlags', wintypes.DWORD),
        ('lpNext', ctypes.c_void_p),
        ('reserved', ctypes.c_size_t),
        ('dwOffset', wintypes.DWORD),
        ('dwReserved', ctypes.c_size_t * 8),
    ]

received_sysex = []
MIDIINPROC = ctypes.WINFUNCTYPE(None, wintypes.HANDLE, wintypes.UINT, ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t)
def midi_in_callback(hMidiIn, wMsg, dwInstance, dwParam1, dwParam2):
    if wMsg == MIM_LONGDATA:
        pHdr = ctypes.cast(dwParam1, ctypes.POINTER(MIDIHDR)).contents
        if pHdr.dwBytesRecorded > 0:
            data = ctypes.string_at(pHdr.lpData, pHdr.dwBytesRecorded)
            received_sysex.append(data)

cb_func = MIDIINPROC(midi_in_callback)
hIn, hOut = wintypes.HANDLE(), wintypes.HANDLE()
winmm.midiInOpen(ctypes.byref(hIn), 0, cb_func, 0, CALLBACK_FUNCTION)
winmm.midiOutOpen(ctypes.byref(hOut), 1, 0, 0, 0)

headers, buffers = [], []
for _ in range(50):
    buf = (ctypes.c_char * 2048)()
    hdr = MIDIHDR()
    hdr.lpData = ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))
    hdr.dwBufferLength = 2048
    winmm.midiInPrepareHeader(hIn, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    winmm.midiInAddBuffer(hIn, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    headers.append(hdr); buffers.append(buf)

winmm.midiInStart(hIn)
time.sleep(0.1)

def send_sysex(raw_bytes):
    buf = (ctypes.c_char * len(raw_bytes)).from_buffer_copy(raw_bytes)
    hdr = MIDIHDR()
    hdr.lpData = ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))
    hdr.dwBufferLength = len(raw_bytes)
    winmm.midiOutPrepareHeader(hOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    winmm.midiOutLongMsg(hOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    time.sleep(0.05)
    winmm.midiOutUnprepareHeader(hOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))

def analyze_type(cmd_hex, label):
    received_sysex.clear()
    send_sysex(bytes.fromhex(cmd_hex))
    time.sleep(0.6)
    print(f"\n=== {label} (Got {len(received_sysex)} packets) ===")
    for p in received_sysex:
        seq = p[6]
        # Decode all continuous nibble ASCII sequences
        print(f"\nPkt seq={seq} len={len(p)}:")
        print("Raw hex:", p.hex())
        # Let's decode bytes where hi and lo nibbles form ASCII
        for start in range(7, len(p)-2):
            chars = []
            for i in range(start, len(p)-1, 2):
                val = (p[i] << 4) | p[i+1]
                if 32 <= val <= 126:
                    chars.append(chr(val))
                elif val == 0:
                    break
                else:
                    break
            text = "".join(chars).strip()
            if len(text) >= 3:
                print(f"  Candidate at byte offset {start}: '{text}'")

analyze_type('F0030500010000000201020204F7', 'CLONE AMP NAMES')
analyze_type('F0020900010000000201020200F7', 'USER IR NAMES')

winmm.midiInStop(hIn)
winmm.midiInClose(hIn)
winmm.midiOutClose(hOut)
