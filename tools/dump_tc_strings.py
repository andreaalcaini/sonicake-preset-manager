with open(r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so', 'rb') as f:
    app_so = f.read()

import re
pos = 0x1b90d6
chunk = app_so[pos-500:pos+1500]
matches = re.finditer(rb'[\x20-\x7e]{3,}', chunk)
for m in matches:
    print(f"+0x{m.start():03x}: {m.group().decode(errors='ignore')}")
