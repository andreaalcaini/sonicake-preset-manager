import pefile
import capstone

pe = pefile.PE('server/5868USB.dll')
exports = {}
for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols:
    if exp.name:
        exports[exp.name.decode()] = exp.address

image_base = pe.OPTIONAL_HEADER.ImageBase
print("Image Base:", hex(image_base))

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)

for fn in ['appNamConvertClo', 'namConvertClo']:
    rva = exports.get(fn)
    print(f"\n--- {fn} at RVA 0x{rva:x} ---")
    data = pe.get_data(rva, 64)
    for ins in md.disasm(data, image_base + rva):
        print(f"0x{ins.address:x}: {ins.mnemonic} {ins.op_str}")
