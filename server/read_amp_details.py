import re

with open('src/data/command-library.js') as f:
    text = f.read()

for k, v in re.findall(r'"(3\d\d)":\s*"([^"]+)"', text):
    print(f"AMP {k}: {v}")
