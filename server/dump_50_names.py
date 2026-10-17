with open('server/names_dump.bin', 'rb') as f:
    raw = f.read()

pkts = [raw[i:i+48] for i in range(0, len(raw), 48)]
pkts.sort(key=lambda p: (p[5] << 4) | p[6])
all_nibbles = bytearray()
for p in pkts:
    all_nibbles.extend(p[9:-1])

full_data = bytearray()
for i in range(0, len(all_nibbles)-1, 2):
    full_data.append((all_nibbles[i] << 4) | all_nibbles[i+1])

# Header 12 40
for slot in range(50):
    start = 2 + slot * 16
    chunk = full_data[start:start+16]
    name_bytes = chunk[4:14]
    name = ''.join(chr(b) for b in name_bytes if 32 <= b <= 126).strip()
    print(f"Slot {slot+1:02d} (U{slot+1:02d}): '{name}'")
