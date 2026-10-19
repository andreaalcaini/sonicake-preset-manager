with open('backend/5868USB.dll', 'rb') as f:
    dll = f.read()

# RVA of Table1 and Table2
# rbp = rip - 0xe31ee at address 0x1800e31e7
# So rbp = 0x180000000 (ImageBase!)
# So table1 = 0x18d860, table2 = 0x18d960
t1 = dll[0x18d860:0x18d860+256]
t2 = dll[0x18d960:0x18d960+256]

def calc_sonicake_crc16(data):
    # starts at offset 6, length = len(data) - 6
    # initial cl = 0xff, r10b = 0xff
    cl = 0xff
    r10 = 0xff
    for b in data[6:]:
        edx = b ^ cl
        cl = t1[edx] ^ r10
        r10 = t2[edx]
    return (cl << 8) | r10

clo = open(r'C:\Users\andrea\AppData\Roaming\Sonicake\Sonicake Manager\clo\cloFile.clo', 'rb').read()
low = open('tools/captures/transfer2_clone.bin', 'rb').read()[74:]

clo_crc = calc_sonicake_crc16(clo)
low_crc = calc_sonicake_crc16(low)

import struct
clo_stored = struct.unpack_from('<H', clo, 8)[0]
low_stored = struct.unpack_from('<H', low, 8)[0]

print(f"CLO calculated: {clo_crc} (0x{clo_crc:04x}), stored: {clo_stored} (0x{clo_stored:04x}) -> MATCH = {clo_crc == clo_stored}")
print(f"Low calculated: {low_crc} (0x{low_crc:04x}), stored: {low_stored} (0x{low_stored:04x}) -> MATCH = {low_crc == low_stored}")
