import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

pos = content.find(b'send importTC, fxid=')
print(f"Offset: {pos}")
# Show 500 bytes before and 1500 bytes after
chunk = content[pos-200:pos+1200]
# Find all printable strings
matches = re.finditer(rb'[\x20-\x7e]{2,}', chunk)
for m in matches:
    print(f"  +0x{m.start():03x}: {m.group().decode(errors='ignore')}")
