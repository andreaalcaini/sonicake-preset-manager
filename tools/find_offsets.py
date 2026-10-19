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

# Search for sequential indices
for idx in range(15):
    # Find idx as uint32 or uint16
    target16 = idx.to_bytes(2, 'little')
    target32 = idx.to_bytes(4, 'little')
    pos16 = [i for i in range(len(full_data)-2) if full_data[i:i+2] == target16]
    pos32 = [i for i in range(len(full_data)-4) if full_data[i:i+4] == target32]
    print(f"Index {idx}: pos32={pos32[:5]}")
