import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

# Let's search for "importTC, fxid=" or any formatting of SysEx commands around it
pos = content.find(b'send importTC, fxid=')
print(f"Offset: {pos}")
# Look within 2000 bytes before and after in raw bytes
chunk = content[pos-1000:pos+1000]

# Search for any SysEx command patterns (e.g. F0 ... F7, or arrays of ints)
# In Dart, byte arrays or lists might be created or sent to HTDeviceManager / sendMidiMessage
print("Searching for hex patterns...")
matches = re.finditer(rb'F0[0-9A-Fa-f]{10,}', content)
for m in matches:
    print("SysEx string found:", m.group().decode(errors='ignore')[:40])
