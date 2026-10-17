import json

data = json.load(open(r"C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\data\qme20_module_data.json", encoding="utf-8"))

# Internal ID bases:
# NR: 1 (Gate)
# FX1: 101 + idx
# DRV: 201 + idx
# AMP: 301 + idx
# IR:  401 + idx (Factory) and 416 + idx (User IR)
# EQ:  501 + idx
# FX2: 601 + idx
# DLY: 701 + idx
# RVB: 801 + idx
# Clone: 901 + idx

mapping = {}

# NR
mapping[27] = 1 # Gate

# FX1
fx1_list = [m for m in data["modules"] if m["name"] == "FX1"][0]["module"]
for idx, eff in enumerate(fx1_list):
    fid = eff["fxid"]
    mapping[fid] = 101 + idx

# DRV
drv_list = [m for m in data["modules"] if m["name"] == "DRV"][0]["module"]
for idx, eff in enumerate(drv_list):
    fid = eff["fxid"]
    mapping[fid] = 201 + idx

# AMP
amp_list = [m for m in data["modules"] if m["name"] == "AMP"][0]["module"]
for idx, eff in enumerate(amp_list):
    fid = eff["fxid"]
    mapping[fid] = 301 + idx
# Add Bog XT Modern (0x0700006e = 117440622) -> maps to 320 (Bog XT)
mapping[117440622] = 320

# IR
ir_list = [m for m in data["modules"] if m["name"] == "IR"][0]["module"]
for idx, eff in enumerate(ir_list):
    fid = eff["fxid"]
    if idx < 15:
        mapping[fid] = 401 + idx
    else:
        mapping[fid] = 416 + (idx - 15)

# EQ
eq_list = [m for m in data["modules"] if m["name"] == "EQ"][0]["module"]
for idx, eff in enumerate(eq_list):
    fid = eff["fxid"]
    mapping[fid] = 501 + idx

# FX2
fx2_list = [m for m in data["modules"] if m["name"] == "FX2"][0]["module"]
for idx, eff in enumerate(fx2_list):
    fid = eff["fxid"]
    mapping[fid] = 601 + idx

# DLY
dly_list = [m for m in data["modules"] if m["name"] == "DLY"][0]["module"]
for idx, eff in enumerate(dly_list):
    fid = eff["fxid"]
    mapping[fid] = 701 + idx

# RVB
rvb_list = [m for m in data["modules"] if m["name"] == "RVB"][0]["module"]
for idx, eff in enumerate(rvb_list):
    fid = eff["fxid"]
    mapping[fid] = 801 + idx

# Clone (0 to 4)
for i in range(5):
    mapping[251658240 + i] = 901 + i

print("Total mapped FXIDs:", len(mapping))
with open('server/fxid_map.json', 'w') as out:
    json.dump(mapping, out, indent=2)
print("Saved to server/fxid_map.json")
