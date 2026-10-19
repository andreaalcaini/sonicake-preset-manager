import json

data = json.load(open('tools/captured_packets.json'))

print(f"Total entries: {len(data)}")

# Let's see non-streaming packets (not 48 bytes)
non_stream = [d for d in data if d.get('length') != 48]
print(f"Non-stream entries: {len(non_stream)}")
for d in non_stream:
    print(f"[{d.get('direction')}] len={d.get('length')} hex={d.get('hex')}")

# Now let's analyze the streaming packets (48 bytes and the last packet)
stream = [d for d in data if d.get('length') == 48 or (d.get('direction') == 'OUT' and d.get('length') not in (3, 14))]
print(f"\nStream packets count: {len(stream)}")
print("First stream packet:", stream[0]['hex'])
print("Last stream packet:", stream[-1]['hex'])
print("Last stream packet length:", stream[-1]['length'])

# Check timing
timestamps = [d['timestamp'] for d in stream]
diffs = [timestamps[i+1] - timestamps[i] for i in range(len(timestamps)-1)]
print(f"Average interval: {sum(diffs)/len(diffs)*1000:.2f} ms")
print(f"Min interval: {min(diffs)*1000:.2f} ms")
print(f"Max interval: {max(diffs)*1000:.2f} ms")
