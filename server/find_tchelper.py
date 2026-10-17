import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

for m in re.finditer(b'TcHelper', content):
    pos = m.start()
    chunk = content[max(0, pos-200):min(len(content), pos+400)]
    strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
    print(f"At {pos}:")
    for s in strings:
        print("  ", s.decode(errors='ignore'))
