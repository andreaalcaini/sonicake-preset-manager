import pefile
import capstone

pe = pefile.PE('server/5868USB.dll')
exports = {exp.name.decode(): exp.address for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols if exp.name}
image_base = pe.OPTIONAL_HEADER.ImageBase

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)
rva = exports['appNamConvertClo']
data = pe.get_data(rva, 300)

for ins in md.disasm(data, image_base + rva):
    print(f"0x{ins.address:x}: {ins.mnemonic} {ins.op_str}")
