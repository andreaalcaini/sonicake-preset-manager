import re
import struct

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

# 901 in decimal = 0x0385. Little-endian = \x85\x03
# 902 = \x86\x03
# 416 = 0x01a0 = \xa0\x01
print(f"Occurrences of 901 (\\x85\\x03): {len(re.findall(b'\\x85\\x03', content))}")
print(f"Occurrences of 416 (\\xa0\\x01): {len(re.findall(b'\\xa0\\x01', content))}")

# Look for string 'send importTC'
pos = content.find(b'send importTC')
print(f"'send importTC' at {pos}")
if pos != -1:
    # Look for functions or instructions before and after
    print("Around send importTC:")
    print(content[pos-50:pos+150])
