import json
import sys

sys.stdout.reconfigure(encoding='utf-8')
data = json.load(open(r"C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\data\qme20_module_data.json", encoding="utf-8"))

with open('server/qme20_items.txt', 'w', encoding='utf-8') as out:
    for m in data.get("modules", []):
        m_name = m.get("name")
        m_id = m.get("moduleId")
        out.write(f"\n=================== MODULE {m_id}: {m_name} ===================\n")
        models = m.get("module", [])
        for item in models:
            item_keys = {k: item[k] for k in item if k not in ['alg', 'parameters', 'descriptionEn', 'descriptionZh']}
            out.write(f"  {item_keys}\n")
print("Done writing qme20_items.txt")
