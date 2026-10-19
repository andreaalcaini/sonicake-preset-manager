import struct
import re

with open(r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so', 'rb') as f:
    app_so = f.read()

# Let's search for 2560 and 2696 in the binary
# 2560 = 0x0a00
# 2696 = 0x0a88 (or 2696 as int)
# 8840 = 0x2288
# 8704 = 0x2200

# Search for 2696 in little-endian 32-bit int: 0x00000a88 -> \x88\x0a\x00\x00
print("Searching \\x88\\x0a\\x00\\x00 (2696):")
matches = [m.start() for m in re.finditer(b'\x88\x0a\x00\x00', app_so)]
print(f"Found {len(matches)} matches")

# Look at cloFile.clo vs transfer1_clone.bin[74:]!
clo = open(r'C:\Users\andrea\AppData\Roaming\Sonicake\Sonicake Manager\clo\cloFile.clo', 'rb').read()
trans1 = open('tools/captures/transfer1_clone.bin', 'rb').read()[74:]

print("clo length:", len(clo))
print("trans1 length:", len(trans1))
print("clo header:", clo[:32].hex())
print("trans1 header:", trans1[:32].hex())

# Let's compare the bytes!
print("\nComparing clo and trans1:")
print("trans1[:16]:", trans1[:16].hex())
print("clo[:16]:", clo[:16].hex())
