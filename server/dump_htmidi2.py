import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

for pos in [1571531, 1920816]:
    print(f"\n--- Around {pos} ---")
    chunk = content[pos-200:pos+800]
    matches = re.finditer(rb'[\x20-\x7e]{3,}', chunk)
    for m in matches:
        print(f"+{m.start()}: {m.group().decode(errors='ignore')}")
