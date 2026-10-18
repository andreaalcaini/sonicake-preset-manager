import json

data = json.load(open(r"C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\data\qme20_module_data.json", encoding="utf-8"))

for m in data.get("modules", []):
    m_name = m.get("name")
    m_id = m.get("moduleId")
    effects = m.get("module", [])
    print(f"\nModule {m_id} ({m_name}): {len(effects)} effects")
    for idx, eff in enumerate(effects):
        fid = eff.get("fxid")
        fname = eff.get("name")
        print(f"  idx {idx:2d}: fxid={fid:9d} (0x{fid:08x}) -> '{fname}'")
