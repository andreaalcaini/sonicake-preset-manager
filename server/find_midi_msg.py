import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

matches = re.findall(rb'HTMIDIMessage[A-Za-z0-9_.]+', content)
print("HTMIDIMessage references:")
for m in sorted(set(matches)):
    print(m.decode(errors='ignore'))

matches2 = re.findall(rb'import[A-Za-z0-9_]+', content)
print("\nImport methods:")
for m in sorted(set(matches2)):
    if any(k in m.lower() for k in [b'ir', b'clone', b'tc', b'file', b'sound']):
        print(m.decode(errors='ignore'))
