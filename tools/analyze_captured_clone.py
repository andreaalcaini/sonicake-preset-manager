import json

data = json.load(open('tools/captured_packets.json'))

# Filter long SysEx packets (length 48 or 14 to 50)
sysex_pkts = [d for d in data if d.get('direction') == 'OUT' and d.get('length', 0) > 10]
print(f"Total SysEx packets: {len(sysex_pkts)}")

# Show pre-flash packets
for i, p in enumerate(sysex_pkts[:10]):
    print(f"Pkt {i}: len={p['length']} hex={p['hex'][:60]}")

# Let's inspect packet 0 (is it REQUEST_CLONE_AMP_NAMES or an import command?)
p0 = sysex_pkts[0]
print("\nFirst packet:")
print(p0['hex'])

# Let's look at the streaming packets
stream_pkts = [p for p in sysex_pkts if p['length'] in (48, 36, 14, 20)]
print(f"\nStream packets count: {len(stream_pkts)}")

# Decode streaming packets structure
# F0 [crc_hi, crc_lo] [total_hi, total_lo] [idx_hi, idx_lo] [len_hi, len_lo] [payload...] F7
p_stream_0 = sysex_pkts[1] # first 48-byte packet
h = p_stream_0['hex']
print("\nFirst stream packet full hex:")
print(h)

total_packets_hex = h[6:10]
print("Total packets field:", total_packets_hex)
# In our protocol: totalPackets was (h[6]<<4)|h[8] or (h[6:8])?
# Let's check bytes:
b = bytes.fromhex(h)
print("Bytes:", [hex(x) for x in b[:10]])
crc = (b[1] << 4) | b[2]
total = (b[3] << 4) | b[4]
idx = (b[5] << 4) | b[6]
chunk_len = (b[7] << 4) | b[8]
print(f"CRC: 0x{crc:02x}, Total Packets: {total} (0x{total:02x}), Pkt Index: {idx}, Chunk Len: {chunk_len}")

# Let's reconstruct the unexpanded binary payload!
reconstructed_bytes = bytearray()
for p in sysex_pkts[1:]:
    pb = bytes.fromhex(p['hex'])
    p_len = (pb[7] << 4) | pb[8]
    # payload is in nibbles from pb[9] to pb[9 + p_len*2]
    chunk = bytearray()
    for j in range(p_len):
        hi = pb[9 + j*2]
        lo = pb[9 + j*2 + 1]
        chunk.append((hi << 4) | lo)
    reconstructed_bytes.extend(chunk)

print(f"\nReconstructed Binary Payload Length: {len(reconstructed_bytes)} bytes")
print("First 64 bytes hex:", reconstructed_bytes[:64].hex())
print("First 64 bytes ASCII:", repr(bytes(reconstructed_bytes[:64])))
with open('tools/captures/reconstructed_clone_upload.bin', 'wb') as f:
    f.write(reconstructed_bytes)
print("Saved to tools/captures/reconstructed_clone_upload.bin")
