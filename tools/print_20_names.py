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

print(f"Total length: {len(full_data)}")
for slot in range(min(50, (len(full_data) - 2) // 20)):
    start = 2 + slot * 20
    idx = int.from_bytes(full_data[start:start+4], 'little')
    name_bytes = full_data[start+4:start+20]
    # ASCII null-terminated
    name = ''
    for b in name_bytes:
        if b == 0: break
        if 32 <= b <= 126: name += chr(b)
    slot_num = slot + 1
    code = f"U{slot_num:02d}" if slot_num <= 50 else f"F{slot_num-50:02d}"
    print(f"[{code}] Slot {slot_num:02d} (idx={idx}): '{name}'")
