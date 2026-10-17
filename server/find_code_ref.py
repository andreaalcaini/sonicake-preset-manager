import struct
import capstone

app_so_path = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so_path, 'rb') as f:
    elf = f.read()

# Let's search for "send importTC" in .rodata
pos = elf.find(b'send importTC, fxid=')
print(f"'send importTC, fxid=' at 0x{pos:x}")

# In Dart AOT, how is the string referenced?
# Let's search for any references in .rodata or .text
# The string address in memory: .rodata starts at 0x200
# ELF load address is typically 0
# Let's search for occurrences of pos in 4-byte or 8-byte ints
matches_4 = [i for i in range(0, len(elf)-4, 4) if struct.unpack_from('<I', elf, i)[0] == pos]
matches_8 = [i for i in range(0, len(elf)-8, 8) if struct.unpack_from('<Q', elf, i)[0] == pos]
print(f"Direct 32-bit refs: {[hex(m) for m in matches_4]}")
print(f"Direct 64-bit refs: {[hex(m) for m in matches_8]}")

# What about tagged pointers? In Dart, Object pointers have bit 0 set (ptr | 1)
pos_tagged = pos | 1
matches_tagged = [i for i in range(0, len(elf)-8, 8) if struct.unpack_from('<Q', elf, i)[0] == pos_tagged]
print(f"Tagged 64-bit refs: {[hex(m) for m in matches_tagged]}")
