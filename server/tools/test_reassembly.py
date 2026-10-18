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

received_sysex.clear()
send_sysex(bytes.fromhex('F0030500010000000201020204F7'))
time.sleep(0.6)

# Sort packets by seq
pkts_by_seq = {}
for p in received_sysex:
    # byte 4: 05, byte 5: 00, byte 6: seq
    if len(p) > 7 and p[4] == 0x05 and p[5] == 0x00:
        seq = p[6]
        pkts_by_seq[seq] = p

print("Found sequences:", sorted(pkts_by_seq.keys()))

# Look at headers:
# Pkt 0: F0 [b1 b2] [b3 b4] [05 00] [00] [01 03] [01 02 02 04] ...
# Pkt 1: F0 [b1 b2] [b3 b4] [05 00] [01] [01 03] [payload] F7
# What is the header length of each packet?
# Notice: len is 48 (or 32 for last).
# What if payload is between offset 9 (or after [seq] [len]) and len-1?
# In stream upload, format was:
# F0 [crc_hi, crc_lo] [total_hi, total_lo] [idx_hi, idx_lo] [chunklen_hi, chunklen_lo] [payload...] F7
# Let's check bytes 1..9 of each packet:
for seq in sorted(pkts_by_seq.keys()):
    p = pkts_by_seq[seq]
    crc = (p[1] << 4) | p[2]
    total = (p[3] << 4) | p[4] # Wait: p[3]=0, p[4]=5 -> total=5!
    idx = (p[5] << 4) | p[6]   # p[5]=0, p[6]=seq -> idx=seq!
    chunk_len = (p[7] << 4) | p[8] # p[7]=1, p[8]=3 -> chunk_len = (1<<4)|3 = 0x13 = 19 bytes!
    # 19 bytes = 38 nibbles! 9 + 38 = 47. 47 is F7!
    # EXACTLY 19 BYTES (38 nibbles) of payload per packet!
    # And in packet 4: p[7]=0, p[8]=0x0b -> chunk_len = 11 bytes = 22 nibbles! 9 + 22 = 31. 31 is F7!
    print(f"Seq {seq}: total={total}, idx={idx}, chunk_len={chunk_len} bytes (38 nibbles: indices 9..{9+chunk_len*2})")

# Let's reassemble the entire stream!
full_stream = bytearray()
for seq in range(5):
    if seq in pkts_by_seq:
        p = pkts_by_seq[seq]
        chunk_len = (p[7] << 4) | p[8]
        # raw nibbles:
        nibbles = p[9 : 9 + chunk_len * 2]
        full_stream.extend(nibbles)

print(f"\nFull concatenated nibbles length: {len(full_stream)} nibbles = {len(full_stream)//2} bytes")
print("Full hex:", full_stream.hex())

# Now let's decode using standard protocol.js decodeName or stride 64 nibbles!
# If each slot has 32 bytes (64 nibbles):
# Slot 0: nibbles 0..64
# Slot 1: nibbles 64..128
# Slot 2: nibbles 128..192
# Slot 3: nibbles 192..256
# Slot 4: nibbles 256..320
# Let's check!
print("\n--- Testing 64-nibble stride on full stream ---")
# First, let's look at the first few nibbles:
# In packet 0: p[9..] was 01 02 02 04 ... (the command echo! 4 bytes = 8 nibbles)
# Let's inspect where slot 0 starts!
for offset in range(0, 30):
    slots = []
    for s in range(5):
        s_start = offset + s * 32 # or s * 64 nibbles
        # Let's test if nibbles at s_start decode to clean ASCII
        s_nibbles = full_stream[s_start : s_start + 32]
        s_chars = []
        for k in range(0, len(s_nibbles)-1, 2):
            val = (s_nibbles[k] << 4) | s_nibbles[k+1]
            if 32 <= val <= 126:
                s_chars.append(chr(val))
            elif val == 0:
                break
            else:
                break
        slots.append("".join(s_chars))
    if any(len(x) > 4 for x in slots):
        print(f"Offset {offset}: {slots}")

# Test User IR
received_sysex.clear()
send_sysex(bytes.fromhex('F0020900010000000201020200F7'))
time.sleep(0.6)

ir_by_seq = {}
for p in received_sysex:
    if len(p) > 7 and p[4] == 0x05 and p[5] == 0x00:
        seq = p[6]
        ir_by_seq[seq] = p

ir_stream = bytearray()
for seq in range(5):
    if seq in ir_by_seq:
        p = ir_by_seq[seq]
        chunk_len = (p[7] << 4) | p[8]
        ir_stream.extend(p[9 : 9 + chunk_len * 2])

print(f"\n--- User IR Concatenated ({len(ir_stream)} bytes) ---")
for offset in range(0, 30):
    slots = []
    for s in range(5):
        s_start = offset + s * 32
        s_nibbles = ir_stream[s_start : s_start + 32]
        s_chars = []
        for k in range(0, len(s_nibbles)-1, 2):
            val = (s_nibbles[k] << 4) | s_nibbles[k+1]
            if 32 <= val <= 126:
                s_chars.append(chr(val))
            elif val == 0:
                break
            else:
                break
        slots.append("".join(s_chars))
    if any(len(x) > 4 for x in slots):
        print(f"IR Offset {offset}: {slots}")

winmm.midiInStop(hIn)
winmm.midiInClose(hIn)
winmm.midiOutClose(hOut)

