import json
import os

folder = r"C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\data"
for f in os.listdir(folder):
    if f.endswith('.json'):
        path = os.path.join(folder, f)
        d = json.load(open(path, encoding='utf-8'))
        for m in d.get('modules', []):
            for eff in m.get('module', []):
                fid = eff.get('fxid')
                if fid in [0x0700006e, 117440622, 0x0700006d, 117440621]:
                    print(f"File {f}: fxid={fid} (0x{fid:08x}) -> '{eff.get('name')}' / '{eff.get('origin')}'")
