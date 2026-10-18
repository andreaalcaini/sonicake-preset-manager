import json

data = json.load(open('server/tools/captured_packets.json'))
stream = [d for d in data if d.get('length') in (48, 40, 36)]

# Transfer 1: pkts 0 to 146
transfer1 = stream[:146]
print(f"Transfer 1 packets count: {len(transfer1)}")

raw1 = bytearray()
for p in transfer1:
    b = bytes.fromhex(p['hex'])
    p_len = (b[7] << 4) | b[8]
    for j in range(p_len):
        raw1.append((b[9 + j*2] << 4) | b[9 + j*2 + 1])

print(f"Transfer 1 payload length: {len(raw1)} bytes")
print("Header (first 74 bytes):")
print(raw1[:74].hex())
print("ASCII name at 10..42:")
print(repr(bytes(raw1[10:42])))

print("\nBytes at offset 0..10:")
print([hex(x) for x in raw1[:10]])

print("\nWhat is at offset 74?:")
print(raw1[74:110].hex())
print(repr(bytes(raw1[74:110])))

with open('server/transfer1_clone.bin', 'wb') as f:
    f.write(raw1)
