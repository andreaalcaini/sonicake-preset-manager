import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

for off in [1573571, 1949219]:
    print(f"\n--- Around {off} ---")
    chunk = content[off-200:off+400]
    matches = re.findall(rb'[\x20-\x7e]{3,}', chunk)
    for m in matches:
        print(" ", m.decode(errors='ignore'))
