import ctypes
import os

dll = ctypes.CDLL(r'C:\Users\andrea\Documents\Siti\sonicake-preset-manager\server\5868USB.dll')

# Let's test namConvertClo
# In 5868USB.dll, what is the signature of namConvertClo?
# Let's test calling namConvertClo with input_path and output_path
# We have a sample model in server/cache/:
# Wait, do we have a .nam file in server/cache/?
# We can download a small .nam file from tone3000 to test!
import urllib.request
test_nam = r'C:\Users\andrea\Documents\Siti\sonicake-preset-manager\server\test_model.nam'
test_clo = r'C:\Users\andrea\Documents\Siti\sonicake-preset-manager\server\test_model.clo'

if not os.path.exists(test_nam):
    url = 'https://api.tone3000.com/storage/v1/object/public/models/ba8d7b0539e322ea.nam'
    print(f"Downloading test NAM from {url}...")
    urllib.request.urlretrieve(url, test_nam)
    print("Downloaded:", os.path.getsize(test_nam), "bytes")

# Let's check dll.namConvertClo
try:
    # Function signature: const char* in, const char* out
    dll.namConvertClo.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
    dll.namConvertClo.restype = ctypes.c_int
    res = dll.namConvertClo(test_nam.encode('utf-8'), test_clo.encode('utf-8'))
    print("namConvertClo result:", res)
    if os.path.exists(test_clo):
        sz = os.path.getsize(test_clo)
        print("Generated .clo size:", sz)
        with open(test_clo, 'rb') as fp:
            data = fp.read()
        print("First 16 bytes:", data[:16])
except Exception as e:
    print("Error:", e)
