import json

data = json.load(open(r"C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\data\qme20_module_data.json", encoding="utf-8"))
amp = [m for m in data.get("modules", []) if m.get("name") == "AMP"][0]
for eff in amp.get("module", []):
    fid = eff.get("fxid")
    print(f"fxid: {fid} (0x{fid:08x}) -> '{eff.get('name')}' ({eff.get('origin')})")

print("\n--- Also check other json files (qam20, qme10, etc.) for fxid 117440622 ---")
for fn in ['qme10_module_data.json', 'qam20_module_data.json', 'qap50_module_data.json', 'qbs60_module_data.json']:
    p = rf"C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\data\{fn}"
    d = json.load(open(p, encoding='utf-8'))
    for m in d.get('modules', []):
        for eff in m.get('module', []):
            if eff.get('fxid') == 117440622 or eff.get('fxid') == 0x0700006e:
                print(f"Found in {fn}: {eff.get('name')} ({eff.get('origin')})")
