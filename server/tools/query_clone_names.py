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
            received_sysex.append(ctypes.string_at(pHdr.lpData, pHdr.dwBytesRecorded))

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

def send_sysex(hex_str):
    raw = bytes.fromhex(hex_str)
    buf = (ctypes.c_char * len(raw)).from_buffer_copy(raw)
    hdr = MIDIHDR()
    hdr.lpData = ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))
    hdr.dwBufferLength = len(raw)
    winmm.midiOutPrepareHeader(hOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    winmm.midiOutLongMsg(hOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    time.sleep(0.04)
    winmm.midiOutUnprepareHeader(hOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))

# Request Clone names (Slot 1 to 5)
send_sysex('F0030500010000000201020204F7')
time.sleep(0.3)

# Filter responses
for p in received_sysex:
    h = p.hex().upper()
    if '01020204' in h and len(h) >= 80:
        print("Clone Names packet:", h)
        # Decode names
        # Starting offset 50 chars (25 bytes)
        payload = h[50:]
        print("Clone Payload:", payload[:100])

winmm.midiInStop(hIn)
winmm.midiInClose(hIn)
winmm.midiOutClose(hOut)
