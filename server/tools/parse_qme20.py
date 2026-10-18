import json

data = json.load(open(r"C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\data\qme20_module_data.json", encoding="utf-8"))

modules = data.get("modules", [])
print(f"Total modules: {len(modules)}")

# Look for each module and its effects
for m in modules:
    mod_name = m.get("name", "Unknown")
    mod_id = m.get("id")
    effects = m.get("effects", [])
    print(f"\n--- Module {mod_id}: {mod_name} ({len(effects)} effects) ---")
    for eff in effects:
        eff_id = eff.get("id")
        eff_name = eff.get("name")
        # Check if ID matches 0x6e (110) or 0x0700006e or 27 or 0x11 or 0x2b or 0x28 or 0x35
        raw_id = hex(eff_id) if isinstance(eff_id, int) else eff_id
        if eff_id in [27, 0x11, 0x2b, 0x6e, 0x28, 0x35, 110, 0x0700006e] or '6e' in str(raw_id).lower() or mod_name in ['AMP', 'PRE', 'DST']:
            print(f"  Effect ID={eff_id} (0x{eff_id:08x} / {eff_id}): '{eff_name}'")
