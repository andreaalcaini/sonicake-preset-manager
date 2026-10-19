import struct

clo = open(r'C:\Users\andrea\AppData\Roaming\Sonicake\Sonicake Manager\clo\cloFile.clo', 'rb').read()
low = open('tools/captures/transfer2_clone.bin', 'rb').read()[74:]

print("CLO len:", len(clo), "Low len:", len(low))

# Let's inspect the headers (first 136 bytes)
print("\n--- Header comparison ---")
for i in range(0, 136, 16):
    c_chunk = clo[i:i+16].hex()
    l_chunk = low[i:i+16].hex()
    print(f"Offset 0x{i:02x}:")
    print(f"  CLO: {c_chunk}")
    print(f"  LOW: {l_chunk}")
    if c_chunk != l_chunk:
        print("  -> DIFFERENT!")

# Now let's compare the payload / weights after 136 bytes
# In Low model: weights are 2560 bytes (from 136 to 2696)
# In CLO model: weights are 8704 bytes (from 136 to 8840)
print("\n--- Weights comparison ---")
# Are the 2560 bytes of Low model identical to the first 2560 bytes of CLO weights?
low_weights = low[136:2696]
clo_weights = clo[136:136+2560]

diff_count = 0
for j in range(2560):
    if low_weights[j] != clo_weights[j]:
        diff_count += 1

print(f"Differences in first 2560 weights: {diff_count} / 2560")
if diff_count == 0:
    print(">>> THE WEIGHTS ARE 100% IDENTICAL TO THE FIRST 2560 BYTES OF CLO! <<<")
else:
    print("First 10 diffs:")
    for j in range(2560):
        if low_weights[j] != clo_weights[j]:
            print(f"  At +{j}: Low={low_weights[j]:02x} CLO={clo_weights[j]:02x}")
            if j > 10: break
