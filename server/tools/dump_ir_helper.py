import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

pos = content.find(b'import_ir_helper.dart')
print(f"import_ir_helper.dart at {pos}")
if pos != -1:
    chunk = content[pos-300:pos+1000]
    matches = re.finditer(rb'[\x20-\x7e]{3,}', chunk)
    for m in matches:
        print(f"+{m.start()}: {m.group().decode(errors='ignore')}")
