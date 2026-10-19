import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

pos = 1472816
chunk = content[pos-400:pos+1200]
matches = re.finditer(rb'[\x20-\x7e]{3,}', chunk)
for m in matches:
    print(f"+{m.start()}: {m.group().decode(errors='ignore')}")
