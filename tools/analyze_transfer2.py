import json

data = json.load(open('tools/captured_packets.json'))
stream = [d for d in data if d.get('length') in (48, 40, 36)]

transfer2 = stream[146:292]
print(f"Transfer 2 packets count: {len(transfer2)}")

raw2 = bytearray()
for p in transfer2:
    b = bytes.fromhex(p['hex'])
    p_len = (b[7] << 4) | b[8]
    for j in range(p_len):
        raw2.append((b[9 + j*2] << 4) | b[9 + j*2 + 1])

print(f"Transfer 2 payload length: {len(raw2)} bytes")
print("Header (first 74 bytes):")
print(raw2[:74].hex())
print("ASCII name at 10..42:")
print(repr(bytes(raw2[10:42])))
print("First 32 bytes at offset 74:")
print(raw2[74:106].hex())
print(repr(bytes(raw2[74:106])))
