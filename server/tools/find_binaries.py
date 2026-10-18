import re

# Search app.so or resources
app_so_path = r"C:\Program Files\Sonicake\Sonicake Manager\data\flutter_assets\app.so"
# Or wherever app.so is
import os
for root, dirs, files in os.walk(r"C:\Program Files\Sonicake\Sonicake Manager"):
    for f in files:
        if f.endswith('.so') or f.endswith('.dll'):
            path = os.path.join(root, f)
            print("Found:", path)
