import re

app_so_path = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so_path, 'rb') as f:
    elf = f.read()

chunk = elf[0x19fe00:0x1a0200]
matches = re.finditer(rb'[\x20-\x7e]{3,}', chunk)
for m in matches:
    print(f"+0x{m.start():03x}: {m.group().decode(errors='ignore')}")
