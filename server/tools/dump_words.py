import json

data = open('server/preset4_dump.bin', 'rb').read()
with open('src/data/command-library.js') as f:
    cmd_text = f.read()

with open('src/data/module-library.js', encoding='utf-8') as f:
    mod_text = f.read()

# Let's inspect the entire preset4_dump.bin in chunks of 4 bytes (as uint32 and int32 and hex)
for i in range(0, len(data) - 4, 4):
    u32 = int.from_bytes(data[i:i+4], 'little')
    b = data[i:i+4]
    print(f"0x{i:03x} ({i:3d}): {b.hex()}  uint32={u32:10d} (0x{u32:08x})")
