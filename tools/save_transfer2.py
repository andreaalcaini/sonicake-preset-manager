import json

data = json.load(open('tools/captured_packets.json'))
stream = [d for d in data if d.get('length') in (48, 40, 36)]

transfer2 = stream[146:292]
raw2 = bytearray()
for p in transfer2:
    b = bytes.fromhex(p['hex'])
    p_len = (b[7] << 4) | b[8]
    for j in range(p_len):
        raw2.append((b[9 + j*2] << 4) | b[9 + j*2 + 1])

with open('tools/captures/transfer2_clone.bin', 'wb') as f:
    f.write(raw2)
print("Saved tools/captures/transfer2_clone.bin, size:", len(raw2))
