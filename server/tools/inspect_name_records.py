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

print("Header:", full_data[:6].hex())
# Search for each index from 0 to 49
# In Sonicake format, each preset has:
# [index (2 bytes)] [name (10 or 14 bytes)?]
# Let's see:
pos = 2 # skip 12 40
slots = []
while pos < len(full_data):
    # Let's inspect next 20 bytes
    chunk = full_data[pos:pos+20]
    # Check where null terminator is
    # In chunk:
    print(f"Pos {pos:03d}: {chunk.hex()} | {''.join(chr(b) if 32 <= b <= 126 else '.' for b in chunk)}")
    pos += 14 # or whatever
    if len(slots) > 10: break
