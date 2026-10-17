import ctypes
from ctypes import wintypes
import time

winmm = ctypes.windll.winmm
kernel32 = ctypes.windll.kernel32

# Constants
CALLBACK_FUNCTION = 0x00030000
MIM_DATA = 0x3C3
MIM_LONGDATA = 0x3C4
MHDR_DONE = 0x00000001
MHDR_PREPARED = 0x00000002

class MIDIHDR(ctypes.Structure):
    pass

MIDIHDR._fields_ = [
    ('lpData', ctypes.POINTER(ctypes.c_char)),
    ('dwBufferLength', wintypes.DWORD),
    ('dwBytesRecorded', wintypes.DWORD),
    ('dwUser', ctypes.c_size_t),
    ('dwFlags', wintypes.DWORD),
    ('lpNext', ctypes.POINTER(MIDIHDR)),
    ('reserved', ctypes.c_size_t),
    ('dwOffset', wintypes.DWORD),
    ('dwReserved', ctypes.c_size_t * 8),
]

received_sysex = []

# MIDI In Callback
MIDIINPROC = ctypes.WINFUNCTYPE(None, wintypes.HANDLE, wintypes.UINT, ctypes.c_size_t, ctypes.c_size_t, ctypes.c_size_t)

def midi_in_callback(hMidiIn, wMsg, dwInstance, dwParam1, dwParam2):
    if wMsg == MIM_LONGDATA:
        pHdr = ctypes.cast(dwParam1, ctypes.POINTER(MIDIHDR)).contents
        length = pHdr.dwBytesRecorded
        if length > 0:
            data = ctypes.string_at(pHdr.lpData, length)
            received_sysex.append(data)
            print(f"[RECV SYSEX] {length} bytes: {data.hex().upper()[:80]}...")

cb_func = MIDIINPROC(midi_in_callback)

def find_smart_box():
    class MIDIINCAPSW(ctypes.Structure):
        _fields_ = [
            ('wMid', wintypes.WORD),
            ('wPid', wintypes.WORD),
            ('vDriverVersion', wintypes.DWORD),
            ('szPname', wintypes.WCHAR * 32),
            ('dwSupport', wintypes.DWORD),
        ]
    class MIDIOUTCAPSW(ctypes.Structure):
        _fields_ = [
            ('wMid', wintypes.WORD),
            ('wPid', wintypes.WORD),
            ('vDriverVersion', wintypes.DWORD),
            ('szPname', wintypes.WCHAR * 32),
            ('wTechnology', wintypes.WORD),
            ('wVoices', wintypes.WORD),
            ('wNotes', wintypes.WORD),
            ('wChannelMask', wintypes.WORD),
            ('dwSupport', wintypes.DWORD),
        ]

    in_dev = None
    for i in range(winmm.midiInGetNumDevs()):
        caps = MIDIINCAPSW()
        winmm.midiInGetDevCapsW(i, ctypes.byref(caps), ctypes.sizeof(caps))
        if "smart box" in caps.szPname.lower():
            in_dev = i
            print(f"Found MIDI In [{i}]: {caps.szPname}")
            break

    out_dev = None
    for i in range(winmm.midiOutGetNumDevs()):
        caps = MIDIOUTCAPSW()
        winmm.midiOutGetDevCapsW(i, ctypes.byref(caps), ctypes.sizeof(caps))
        if "smart box" in caps.szPname.lower():
            out_dev = i
            print(f"Found MIDI Out [{i}]: {caps.szPname}")
            break

    return in_dev, out_dev

in_idx, out_idx = find_smart_box()
if in_idx is None or out_idx is None:
    print("Smart Box not found in MIDI devices!")
    exit(1)

# Open In
hMidiIn = wintypes.HANDLE()
res = winmm.midiInOpen(ctypes.byref(hMidiIn), in_idx, cb_func, 0, CALLBACK_FUNCTION)
if res != 0:
    print(f"Error opening MIDI In: {res} (device might be in use)")
    exit(1)

# Prepare 16 In Buffers
in_buffers = []
for _ in range(16):
    buf = ctypes.create_string_buffer(4096)
    hdr = MIDIHDR()
    hdr.lpData = ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))
    hdr.dwBufferLength = 4096
    hdr.dwFlags = 0
    winmm.midiInPrepareHeader(hMidiIn, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    winmm.midiInAddBuffer(hMidiIn, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    in_buffers.append((buf, hdr))

winmm.midiInStart(hMidiIn)

# Open Out
hMidiOut = wintypes.HANDLE()
res = winmm.midiOutOpen(ctypes.byref(hMidiOut), out_idx, 0, 0, 0)
if res != 0:
    print(f"Error opening MIDI Out: {res} (device might be in use)")
    winmm.midiInStop(hMidiIn)
    winmm.midiInClose(hMidiIn)
    exit(1)

print("MIDI In and Out opened successfully!")

def send_sysex(hex_str):
    raw = bytes.fromhex(hex_str.replace(" ", ""))
    buf = ctypes.create_string_buffer(raw)
    hdr = MIDIHDR()
    hdr.lpData = ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))
    hdr.dwBufferLength = len(raw)
    hdr.dwFlags = 0
    winmm.midiOutPrepareHeader(hMidiOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    winmm.midiOutLongMsg(hMidiOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
    while not (hdr.dwFlags & MHDR_DONE):
        time.sleep(0.01)
    winmm.midiOutUnprepareHeader(hMidiOut, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))

# 1. Ask for current preset number
print("Requesting active preset number...")
send_sysex("F0000700010000000201020403F7")
time.sleep(0.3)

# 2. Switch to slot 4 (P04)
print("Sending switch to slot 4 (P04)...")
# P04 command:
send_sysex("F00506000100000006010104030003000000000000F7")
time.sleep(0.3)

# 3. Request preset state dump
print("Requesting preset state dump for active preset...")
send_sysex("F0000900010000000201020401F7")

time.sleep(1.0)

winmm.midiInStop(hMidiIn)
winmm.midiInReset(hMidiIn)
for buf, hdr in in_buffers:
    winmm.midiInUnprepareHeader(hMidiIn, ctypes.byref(hdr), ctypes.sizeof(MIDIHDR))
winmm.midiInClose(hMidiIn)
winmm.midiOutClose(hMidiOut)

print(f"Total received packets: {len(received_sysex)}")
with open("test_packets.bin", "wb") as f:
    for p in received_sysex:
        f.write(p + b"\n---PACKET---\n")
