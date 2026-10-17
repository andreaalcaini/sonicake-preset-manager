import json

qme_data = json.load(open(r"C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\assets\data\qme20_module_data.json", encoding="utf-8"))
fx_map = {}
for m in qme_data.get("modules", []):
    for eff in m.get("module", []):
        fx_map[eff.get("fxid")] = (eff.get("name"), eff.get("origin"), m.get("name"))

# Add Clone Amp IDs
for i in range(5):
    cid = 251658240 + i
    fx_map[cid] = (f"Clone AMP {i+1}", f"User Profile Slot {i+1}", "Clone")

data = open('server/preset4_dump.bin', 'rb').read()

# Modules are at 0x064 (offset 100): 10 x 4 bytes
# Bypass mask is at 0x04e (offset 78): uint16 bb01 = 0x01bb
mask = int.from_bytes(data[0x04e:0x050], 'little')
print(f"Bypass mask: 0x{mask:04x} ({bin(mask)})")

module_names = ["NR", "FX1", "DRV", "AMP", "IR", "EQ", "FX2", "DLY", "RVB", "Clone"]

print("\n--- PRESET MODULE CONFIGURATION ---")
for i in range(10):
    val = int.from_bytes(data[100 + i*4 : 100 + (i+1)*4], 'little')
    is_on = bool(mask & (1 << i)) if i < 9 else False
    info = fx_map.get(val, (f"Unknown (0x{val:08x})", "Unknown", module_names[i]))
    state_str = "ON " if is_on else "OFF"
    print(f"[{module_names[i]:5s}] State: {state_str} | fxid: {val:9d} (0x{val:08x}) -> {info[0]} ({info[1]})")

print("\nClone AMP slot is:", fx_map.get(int.from_bytes(data[136:140], 'little'), ("None", "")))
