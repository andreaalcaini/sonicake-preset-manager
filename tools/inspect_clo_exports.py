import ctypes
import os

dll = ctypes.CDLL(r'C:\Users\andrea\Documents\Siti\sonicake-preset-manager\server\5868USB.dll')

# Let's inspect exports related to clo
for attr in dir(dll):
    if 'clo' in attr.lower() or 'nam' in attr.lower():
        print(attr)

# Let's test calling namConvertCloData
# Let's check its signature in 5868USB.dll
import pefile
pe = pefile.PE(r'C:\Users\andrea\Documents\Siti\sonicake-preset-manager\server\5868USB.dll')
exports = {exp.name.decode(): exp.address for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols if exp.name}
for name in sorted(exports.keys()):
    if 'clo' in name.lower() or 'nam' in name.lower():
        print(f"{name:30s} RVA: 0x{exports[name]:x}")
