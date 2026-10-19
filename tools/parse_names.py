import sys

with open('tools/captures/names_dump.bin', 'rb') as f:
    raw = f.read()

pkts = [raw[i:i+48] for i in range(0, len(raw), 48)]
pkts.sort(key=lambda p: (p[5] << 4) | p[6])

all_nibbles = bytearray()
for p in pkts:
    all_nibbles.extend(p[9:-1])

full_data = bytearray()
for i in range(0, len(all_nibbles)-1, 2):
    full_data.append((all_nibbles[i] << 4) | all_nibbles[i+1])

# Let's inspect records
# Stride appears to be 16 or 20 bytes
# Let's find all occurrences of 00 00 <idx> 00 00 00
print(f"Total bytes: {len(full_data)}")
for i in range(0, len(full_data) - 10):
    # Check if ascii string
    sub = full_data[i:i+10]
    # Check if null terminated string
    s = []
    for b in sub:
        if 32 <= b <= 126:
            s.append(chr(b))
        elif b == 0:
            break
        else:
            s = []
            break
    if len(s) >= 4:
        txt = ''.join(s)
        if any(w in txt.lower() for w in ['knock', 'amp', 'clean', 'rock', 'metal']):
            print(f"Offset {i}: {txt}")

for slot in range(0, len(full_data), 16):
    chunk = full_data[slot:slot+16]
    name = ''.join(chr(b) for b in chunk[6:16] if 32 <= b <= 126).strip()
    idx = slot // 16
    slot_num = idx + 1
    code = f"U{slot_num:02d}" if slot_num <= 50 else f"F{slot_num-50:02d}"
    print(f"[{code}] Slot {slot_num:02d}: '{name}' (raw: {chunk.hex()})")
