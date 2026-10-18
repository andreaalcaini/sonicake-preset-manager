import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

pos = content.find(b'send importTC, fxid=')
if pos != -1:
    chunk = content[pos-200:pos+600]
    strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
    print("Strings around 'send importTC, fxid=':")
    for s in strings:
        print("  ", s.decode(errors='ignore'))

pos2 = content.find(b'DeviceDataProvider.importTC.ack')
if pos2 != -1:
    chunk = content[pos2-200:pos2+600]
    strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
    print("\nStrings around 'DeviceDataProvider.importTC.ack':")
    for s in strings:
        print("  ", s.decode(errors='ignore'))
