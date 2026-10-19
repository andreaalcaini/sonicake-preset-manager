import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

idx = content.find(b'tc_helper.dart')
if idx != -1:
    print(f"tc_helper.dart at offset {idx}")
    start = max(0, idx - 4000)
    end = min(len(content), idx + 8000)
    chunk = content[start:end]
    strings = re.findall(rb'[\x20-\x7e]{4,}', chunk)
    print("Strings around tc_helper.dart:")
    for s in strings:
        print(s.decode(errors='ignore'))
