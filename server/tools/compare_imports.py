import re

app_so = r'C:\Program Files\Sonicake\Sonicake Manager\data\app.so'
with open(app_so, 'rb') as f:
    content = f.read()

# Let's search for string 'importIR' and compare with 'importTC'
for kw in [b'importIR', b'importTC', b'importSingleIr', b'importSingleTc']:
    matches = [m.start() for m in re.finditer(kw, content)]
    print(f"{kw.decode()}: {matches}")

# Let's inspect around importIR at the same location as importTC
pos_ir = content.find(b'send importIR') if b'send importIR' in content else -1
print("send importIR:", pos_ir)
pos_ir2 = content.find(b'importIR, fxid=')
print("importIR, fxid=:", pos_ir2)
for m in re.finditer(rb'import(?:IR|TC)[^\x00\r\n]{0,30}', content):
    print("Match:", m.group().decode(errors='ignore'))
