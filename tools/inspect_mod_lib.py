import re

with open('src/data/module-library.js') as f:
    text = f.read()

# Let's inspect effectLibrary
lines = text.split('\n')
for i, line in enumerate(lines):
    if 'effectLibrary' in line:
        for l in lines[i:i+60]:
            print(l)
        break
