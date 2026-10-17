import json

data = json.load(open('server/captured_packets.json'))
stream = [d for d in data if d.get('length') in (48, 40, 36)]

print(f"Total stream packets: {len(stream)}")

# Print packet index progression
indices = []
totals = []
lengths = []
for i, p in enumerate(stream):
    b = bytes.fromhex(p['hex'])
    tot = (b[3] << 4) | b[4]
    idx = (b[5] << 4) | b[6]
    ln = (b[7] << 4) | b[8]
    totals.append(tot)
    indices.append(idx)
    lengths.append(ln)

print("Unique totals:", set(totals))
print("First 10 indices:", indices[:10])
print("Last 10 indices:", indices[-10:])
print("Min index:", min(indices), "Max index:", max(indices))

# Check if there were multiple transfers or 1 transfer!
for i, p in enumerate(stream):
    if indices[i] == 0:
        print(f"Transfer start at stream pkt {i}: total={totals[i]}, hex[:30]={p['hex'][:30]}")
