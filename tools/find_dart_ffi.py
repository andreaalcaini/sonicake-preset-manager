import re

app_so_path = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so_path, 'rb') as f:
    elf = f.read()

pos = 0
while True:
    pos = elf.find(b'namConvertCloData', pos)
    if pos == -1: break
    print(f"namConvertCloData at 0x{pos:x}")
    chunk = elf[max(0, pos-200):min(len(elf), pos+400)]
    strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
    for s in strings:
        print(" ", s.decode(errors='ignore'))
    pos += len(b'namConvertCloData')
