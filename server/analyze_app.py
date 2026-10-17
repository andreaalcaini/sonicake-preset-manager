import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

keywords = [b'tc_helper', b'import_ir_helper', b'tone_catch', b'sound_clone', b'HTMIDIMessage']
matches = re.findall(rb'[\x20-\x7e]{4,80}', content)

for kw in keywords:
    print(f"\n--- Matches for {kw.decode()} ---")
    sub = [m.decode(errors='ignore') for m in matches if kw.lower() in m.lower()]
    for s in set(sub[:25]):
        print(s)
