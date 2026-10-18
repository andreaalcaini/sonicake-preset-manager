import re

app_so_path = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so_path, 'rb') as f:
    elf = f.read()

# Let's search around 1935417 and 2155648
for pos in [1935417, 2155648]:
    print(f"\n--- Around 0x{pos:x} ({pos}) ---")
    chunk = elf[max(0, pos-200):min(len(elf), pos+600)]
    strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
    for s in strings:
        print(" ", s.decode(errors='ignore'))
