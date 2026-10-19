data = open('tools/captures/preset4_dump.bin', 'rb').read()

print("File size:", len(data))

# Format is TLV (Tag, Length, Value) or structured blocks
# Let's inspect each field
# Notice patterns like:
# [Tag: 2 bytes] [Length: 2 bytes] [Data...]
pos = 0
while pos < len(data) - 4:
    tag = int.from_bytes(data[pos:pos+2], 'little')
    length = int.from_bytes(data[pos+2:pos+4], 'little')
    # If length is reasonable (<= 100)
    if 0 < length <= len(data) - (pos + 4):
        val = data[pos+4:pos+4+length]
        print(f"Offset 0x{pos:03x} ({pos:3d}): Tag=0x{tag:04x} ({tag:5d}), Len={length:3d}, Val={val.hex()}")
        pos += 4 + length
    else:
        # maybe not tag/len at this pos, step 2 bytes
        pos += 2
