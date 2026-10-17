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

def send_sysex(raw_bytes):
    buf = (ctypes.c_char * len(raw_bytes)).from_buffer_copy(raw_bytes)
    hdr = MIDIHDR()
    hdr.lpData = ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))
    hdr.dwBufferLength = len(raw_bytes)
    winmm.midiOutPrepareHeader(hOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    winmm.midiOutLongMsg(hOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    time.sleep(0.05)
    winmm.midiOutUnprepareHeader(hOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))

# Test sending REQUEST_CLONE_AMP_NAMES_CMD
# In USB MIDI, 80 80 is stripped, so command is: F0 03 05 00 01 00 00 00 02 01 02 02 04 F7
cmd = bytes.fromhex('F0030500010000000201020204F7')
print("Sending REQUEST_CLONE_AMP_NAMES_CMD:", cmd.hex())
send_sysex(cmd)
time.sleep(0.6)

print(f"Total packets received: {len(received_sysex)}")
for i, pkt in enumerate(received_sysex):
    print(f"\nPacket {i}: len={len(pkt)} hex={pkt.hex()}")
    # Let's decode nibbles
    chars = []
    for j in range(0, len(pkt)-1):
        hi = pkt[j]
        lo = pkt[j+1]
        val = (hi << 4) | lo
        if 32 <= val <= 126:
            chars.append(f"{j}:{chr(val)}")
    print("Printable chars found at offsets:", " ".join(chars))

winmm.midiInStop(hIn)
winmm.midiInClose(hIn)
winmm.midiOutClose(hOut)
