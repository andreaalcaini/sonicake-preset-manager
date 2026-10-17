import capstone

with open(r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so', 'rb') as f:
    app_so = f.read()

# Let's find where the text section is and where the function is
# String offset:
str_pos = app_so.find(b'native namConvertCloData returned')
print(f"String at 0x{str_pos:x}")

# Let's search in the .text section (from 0x2a8000) for references to str_pos
text_start = 0x2a8000
text_size = 0x370d00
text = app_so[text_start:text_start+text_size]

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_64)

# Search for any LEA or MOV pointing near str_pos
# In AOT Dart, let's find occurrences of 0x1de387 or its tagged form
import struct
for i in range(0, len(text)-8, 4):
    v = struct.unpack_from('<I', text, i)[0]
    if v == str_pos or (text_start + i + 4 + v) == str_pos:
        print(f"Ref at 0x{text_start + i:x}")
        # Disassemble around here
        start = max(0, text_start + i - 150)
        chunk = app_so[start:text_start + i + 100]
        for ins in md.disasm(chunk, start):
            print(f"  0x{ins.address:x}: {ins.mnemonic} {ins.op_str}")
        break

print("Done scan.")
