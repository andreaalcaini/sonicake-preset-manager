import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

pos = content.find(b'tone_catch_crc_utils.dart')
print(f"tone_catch_crc_utils at {pos}")
chunk = content[pos-400:pos+1500]
strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
for s in strings:
    print("  ", s.decode(errors='ignore'))
