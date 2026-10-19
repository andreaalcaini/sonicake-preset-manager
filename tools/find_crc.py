import struct

clo = open(r'C:\Users\andrea\AppData\Roaming\Sonicake\Sonicake Manager\clo\cloFile.clo', 'rb').read()
low = open('tools/captures/transfer2_clone.bin', 'rb').read()[74:]

clo_crc = struct.unpack_from('<I', clo, 8)[0]
low_crc = struct.unpack_from('<I', low, 8)[0]
print(f"CLO stored CRC: {clo_crc} (0x{clo_crc:04x})")
print(f"Low stored CRC: {low_crc} (0x{low_crc:04x})")

# Let's search in app.so for the CRC function!
# Remember in app.so: package:qme10_pc/utils/tone_catch_crc_utils.dart2!
with open(r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so', 'rb') as f:
    app_so = f.read()

pos = app_so.find(b'tone_catch_crc_utils.dart')
print(f"tone_catch_crc_utils at 0x{pos:x}")
import re
print([s.decode(errors='ignore') for s in re.findall(rb'[\x20-\x7e]{3,}', app_so[pos-100:pos+200])])
