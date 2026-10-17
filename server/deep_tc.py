import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

# Find strings related to send, flash, upload, sysex in the app
keywords = [b'importSingleTc', b'converTcFile', b'tone_catch_crc', b'HTMIDIMessage']
for kw in keywords:
    pos = 0
    while True:
        pos = content.find(kw, pos)
        if pos == -1:
            break
        print(f"\nFound {kw.decode()} at {pos}:")
        chunk = content[max(0, pos-400):min(len(content), pos+800)]
        strings = re.findall(rb'[\x20-\x7e]{3,}', chunk)
        for s in strings[:30]:
            print("  ", s.decode(errors='ignore'))
        pos += len(kw)
