app_so = open(r"C:\Program Files\Sonicake\Sonicake Manager\data\app.so", "rb").read()

# Search for 6e 00 00 07 or 07 00 00 6e or 110
print(f"app.so length: {len(app_so)}")

# Let's search for amp names from module-library:
# 'TWD Deluxe', 'Brit 800', 'Bog XT', 'Dark Twin', 'Voks 30', 'Sol 100'
amp_names = [
    b"TWD Deluxe", b"B-Man N", b"Dark Twin", b"Voks 30N", b"Jazz 120",
    b"Brit 45", b"Brit 50JP", b"Brit 800", b"B-Man B", b"Voks 30TB",
    b"Sol 100 OD", b"Dizzy VH", b"Eng 120", b"Halen 51", b"Sol 100 LD",
    b"Calif DualV", b"Calif DualM", b"Eng Power", b"Flyman B1+", b"Bog XT",
    b"A BassVT", b"Voks Bass"
]

for name in amp_names:
    pos = 0
    while True:
        pos = app_so.find(name, pos)
        if pos == -1: break
        # Print context around this occurrence
        print(f"Found {name.decode()} at 0x{pos:x}")
        # Look for nearby bytes or numbers
        context = app_so[max(0, pos-40):min(len(app_so), pos+len(name)+40)]
        print(f"  Context: {context.hex()}")
        pos += len(name)
        break # just first occurrence
