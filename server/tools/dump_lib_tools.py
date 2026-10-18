import re

app_so_path = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so_path, 'rb') as f:
    elf = f.read()

pos = elf.find(b'lib_tools.dart')
print(f"lib_tools.dart at 0x{pos:x}")
chunk = elf[pos-200:pos+800]
matches = re.finditer(rb'[\x20-\x7e]{3,}', chunk)
for m in matches:
    print(f"+0x{m.start():03x}: {m.group().decode(errors='ignore')}")
