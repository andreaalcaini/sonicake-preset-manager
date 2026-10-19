import struct

clo = open(r'C:\Users\andrea\AppData\Roaming\Sonicake\Sonicake Manager\clo\cloFile.clo', 'rb').read()
low = open('tools/captures/transfer2_clone.bin', 'rb').read()[74:]

target_clo = 31431
target_low = 42084

# Let's test standard CRC16 polynomials:
# 0x8005 (IBM), 0x1021 (CCITT), 0x3D65 (DNP), 0x8408 (X.25), etc.
polys = [0x8005, 0x1021, 0xA001, 0x8408, 0x1189]

def crc16(data, poly, init, xor_out, refin, refout):
    crc = init
    for byte in data:
        if refin:
            byte = int('{:08b}'.format(byte)[::-1], 2)
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ poly) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    if refout:
        crc = int('{:016b}'.format(crc)[::-1], 2)
    return crc ^ xor_out

# Test slices: data[12:], data[4:], data[16:], data[8:]
found = []
for start in [12, 16, 20, 0, 4, 8]:
    d_clo = clo[start:]
    d_low = low[start:]
    for poly in [0x1021, 0x8005]:
        for init in [0x0000, 0xFFFF, 0x1D0F]:
            for xor_out in [0x0000, 0xFFFF]:
                for refin in [False, True]:
                    for refout in [False, True]:
                        c_res = crc16(d_clo, poly, init, xor_out, refin, refout)
                        if c_res == target_clo:
                            l_res = crc16(d_low, poly, init, xor_out, refin, refout)
                            if l_res == target_low:
                                print(f"MATCH FOUND! start={start}, poly=0x{poly:x}, init=0x{init:x}, xor=0x{xor_out:x}, refin={refin}, refout={refout}")

print("Done brute-force CRC check.")
