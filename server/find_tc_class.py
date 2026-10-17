import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

pos = 0
while True:
    pos = content.find(b'ToneCatchUtils', pos)
    if pos == -1:
        break
    print(f"\nToneCatchUtils at {pos}:")
    chunk = content[max(0, pos-200):min(len(content), pos+400)]
    strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
    for s in strings:
        print("  ", s.decode(errors='ignore'))
    pos += len(b'ToneCatchUtils')
