import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

# In buildIRPayload:
# 11 21 00 00 00 00 00 00 10 0a ...
# Let's search for \x10\x0a or \x11..\x00\x00\x00\x00\x00\x00\x10\x0a
pattern = rb'\x11[\x00-\x7f]\x00\x00\x00\x00\x00\x00\x10\x0a'
matches = list(re.finditer(pattern, content))
print(f"Matches for IR-like header pattern: {len(matches)}")
for m in matches:
    print(f"At 0x{m.start():x}: {m.group().hex()}")

# Also search for \x10\x0a with any byte 0 and byte 1
pattern2 = rb'[\x10-\x20][\x00-\x40]\x00\x00\x00\x00\x00\x00\x10\x0a'
matches2 = list(re.finditer(pattern2, content))
print(f"Matches for pattern2: {len(matches2)}")
for m in matches2:
    print(f"At 0x{m.start():x}: {m.group().hex()}")
