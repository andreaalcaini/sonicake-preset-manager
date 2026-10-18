import json
import re

with open('src/data/module-library.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Extract json inside export const MODULE_LIBRARY_DATA = { ... };
# Let's find AMP entries (301 to 350)
amp_entries = re.findall(r'\"(3\d\d)\":\s*\{\s*\"name\":\s*\"([^\"]+)\"', text)
for k, v in amp_entries:
    print(f"AMP {k}: {v}")

# Also find Clone entries (901 to 910)
clone_entries = re.findall(r'\"(9\d\d)\":\s*\{\s*\"name\":\s*\"([^\"]+)\"', text)
for k, v in clone_entries:
    print(f"Clone {k}: {v}")
