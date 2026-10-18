import struct

clo = open(r'C:\Users\andrea\AppData\Roaming\Sonicake\Sonicake Manager\clo\cloFile.clo', 'rb').read()
low = open('server/transfer1_clone.bin', 'rb').read()[74:]

print("CLO total len:", len(clo))
print("Low total len:", len(low))

# Let's inspect differences in headers
# Header is first 136 bytes?
# In low model:
# 0..3: 'VTSI'
# 4..7: 2696 (uint32)
# 8..11: crc (uint32)
# 12..19: zeroes
# 20..23: 2560 (uint32)
# 24..31: 1.0 (float64)

print("\nCLO header unpacked:")
print("Magic:", clo[:4])
print("Len:", struct.unpack_from('<I', clo, 4)[0])
print("CRC:", struct.unpack_from('<I', clo, 8)[0])
print("ExtendSize:", struct.unpack_from('<I', clo, 20)[0])
print("Float:", struct.unpack_from('<d', clo, 24)[0])

print("\nLow header unpacked:")
print("Magic:", low[:4])
print("Len:", struct.unpack_from('<I', low, 4)[0])
print("CRC:", struct.unpack_from('<I', low, 8)[0])
print("ExtendSize:", struct.unpack_from('<I', low, 20)[0])
print("Float:", struct.unpack_from('<d', low, 24)[0])

# Where do the weights start?
# Let's check offset 136 (0x88):
# Notice: len = 2696, extendSize = 2560!
# 2696 - 2560 = 136 bytes! (0x88 bytes of header!)
print("\nHeader size: exactly 136 bytes (2696 - 2560 = 136, 8840 - 8704 = 136)!")
print("Weights size in CLO:", 8704)
print("Weights size in Low:", 2560)
