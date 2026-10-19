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

# Header 12 40, then 20-byte records (U01-U50, F01-F50): index + 3 bytes, name up to 16 bytes
# (the capture holds only the first frames: records past its end are skipped)
for slot in range(100):
    start = 2 + slot * 20
    if start + 20 > len(full_data):
        break
    name_bytes = full_data[start + 4:start + 20].split(b'\x00')[0]
    name = ''.join(chr(b) for b in name_bytes if 32 <= b <= 126).strip()
    code = f"U{slot + 1:02d}" if slot < 50 else f"F{slot - 49:02d}"
    print(f"Slot {slot+1:03d} ({code}): '{name}'")
