import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

# Search for 2696, or 0x11, 0x01, or clone header in app.so
for s in [b'2696', b'importTC', b'converTcFile', b'tone_catch']:
    matches = [m.start() for m in re.finditer(s, content)]
    print(f"Matches for {s}: {len(matches)}")

# Let's search inside data/flutter_assets to see if there are dart files or jsons
import os
assets_dir = r'C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets'
if os.path.exists(assets_dir):
    print("Files in flutter_assets:")
    for root, dirs, files in os.walk(assets_dir):
        for file in files:
            print(" ", os.path.join(root, file))
