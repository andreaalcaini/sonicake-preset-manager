with open(r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so', 'rb') as f:
    app_so = f.read()

# Let's search for "converTcFile" in .rodata
pos = app_so.find(b'TcHelper.converTcFile')
print(f"TcHelper.converTcFile at 0x{pos:x}")

# Let's see what is around it
chunk = app_so[pos-300:pos+300]
import re
for s in re.findall(rb'[\x20-\x7e]{3,}', chunk):
    print(" ", s.decode(errors='ignore'))
