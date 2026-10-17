import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

for kw in [b'importTC', b'importTcSuccess', b'importSingleTc']:
    pos = 0
    while True:
        pos = content.find(kw, pos)
        if pos == -1:
            break
        print(f"\nFound {kw.decode()} at {pos}:")
        chunk = content[max(0, pos-300):min(len(content), pos+500)]
        strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
        for s in strings:
            print("  ", s.decode(errors='ignore'))
        pos += len(kw)
