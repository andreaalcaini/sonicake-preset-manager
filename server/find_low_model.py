import pefile
import capstone

with open(r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so', 'rb') as f:
    app_so = f.read()

pos = app_so.find(b'low-model conversion')
print(f"low-model conversion at 0x{pos:x}")
# Disassemble around here
# The string is in .rodata. Let's see what strings are around it:
chunk = app_so[pos-200:pos+400]
import re
for s in re.findall(rb'[\x20-\x7e]{3,}', chunk):
    print(" ", s.decode(errors='ignore'))
