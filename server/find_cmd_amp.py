with open('src/data/command-library.js', 'r', encoding='utf-8') as f:
    text = f.read()

import re
# Find all occurrences of amp entries or numbers 301..322 or 6e / 0x6e
lines = text.split('\n')
for i, line in enumerate(lines):
    if any(k in line for k in ['TWD Deluxe', 'Brit 800', 'Bog XT', 'Sol 100', '0700006e', '308', '320']):
        for l in lines[max(0, i-2):min(len(lines), i+5)]:
            print(l)
        break
