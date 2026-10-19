import struct
import capstone

app_so_path = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so_path, 'rb') as f:
    elf = f.read()

# Read ELF 64 header
e_shoff = struct.unpack_from('<Q', elf, 40)[0]
e_shentsize = struct.unpack_from('<H', elf, 58)[0]
e_shnum = struct.unpack_from('<H', elf, 60)[0]

str_needle = b'send importTC, fxid='
str_pos = elf.find(str_needle)
print(f"String offset in file: 0x{str_pos:x}")

# Find references to str_pos
# In AOT Dart on x86_64, string pointers or RIP-relative LEAs might point to str_pos or the Dart String object
# Let's search for the offset as a 32-bit or 64-bit integer, or search RIP-relative LEAs
md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)

# Search for the string object or direct reference
for i in range(0, len(elf) - 8, 8):
    val = struct.unpack_from('<Q', elf, i)[0]
    if val == str_pos or val == (str_pos - 1): # Dart string header is 1-16 bytes before
        print(f"Direct pointer at 0x{i:x}: 0x{val:x}")

# Also search around 1602192 in the .text section
print("Done scan.")
