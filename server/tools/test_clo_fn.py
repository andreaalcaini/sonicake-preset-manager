import ctypes
import os

dll = ctypes.CDLL(r'C:\Users\andrea\Documents\Siti\sonicake-preset-manager\server\5868USB.dll')

# Let's inspect namConvertClo
# Let's find out its signature:
# In appNamConvertClo: Takes 4 arguments? (rcx, rdx, r8, r9)
# Or namConvertClo(char* input_path, char* output_path, ...)
# Let's check with sample .nam file
nam_file = None
# Find any .nam file on the system or in cache
for root, dirs, files in os.walk(r'C:\Users\andrea'):
    for f in files:
        if f.endswith('.nam'):
            nam_file = os.path.join(root, f)
            break
    if nam_file: break

print("Found NAM file:", nam_file)

if nam_file:
    out_clo = r'C:\Users\andrea\Documents\Siti\sonicake-preset-manager\server\test_output.clo'
    # Try calling namConvertClo(in_path, out_path, ...)
    try:
        # Check signature: in_path, out_path
        res = dll.namConvertClo(nam_file.encode('utf-8'), out_clo.encode('utf-8'))
        print("namConvertClo returned:", res)
        if os.path.exists(out_clo):
            print("Output size:", os.path.getsize(out_clo))
            with open(out_clo, 'rb') as f:
                header = f.read(16)
            print("Output header:", header)
    except Exception as e:
        print("Error:", e)
