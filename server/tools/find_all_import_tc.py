import struct
import re

app_so_path = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so_path, 'rb') as f:
    elf = f.read()

# Let's find all occurrences of 'importTC' and see what strings are nearby
for m in re.finditer(b'importTC', elf):
    pos = m.start()
    print(f"\n--- Match at 0x{pos:x} ---")
    chunk = elf[max(0, pos-100):min(len(elf), pos+300)]
    strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
    for s in strings:
        print(" ", s.decode(errors='ignore'))
