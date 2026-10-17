with open('src/data/command-library.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = re.findall(r'\"(3\d\d|9\d\d)\":\s*\"([^\"]+)\"', text)
for k, v in matches:
    print(f"ID {k}: {v}")
