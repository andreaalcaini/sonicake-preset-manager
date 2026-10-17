import pefile
import capstone

pe = pefile.PE(r'C:\Users\andrea\Documents\Siti\sonicake-preset-manager\server\5868USB.dll')
exports = {exp.name.decode(): exp.address for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols if exp.name}
image_base = pe.OPTIONAL_HEADER.ImageBase
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)

rva = exports['namConvertClo']
data = pe.get_data(rva, 200)

print(f"--- namConvertClo at 0x{rva:x} ---")
for ins in md.disasm(data, image_base + rva):
    print(f"0x{ins.address:x}: {ins.mnemonic} {ins.op_str}")
