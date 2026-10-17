pkts = [
    'F004070005000001030102020400000000000100010001050006050704060507020703060207050702060700000000F7',
    'F0040400050001010300000000000000000401070506040609060F0200040107030703060100000000000000000000F7',
    'F00A0900050002010300000405060D070007040709000000000000000000000000000000000000000000000405060DF7',
    'F0060E000500030103070007040709000000000000000000000000000000000000000000000405060D070007040709F7',
    'F0020700050004000B00000000000000000000000000000000000000000000F7'
]

for idx, p_hex in enumerate(pkts):
    p = bytes.fromhex(p_hex)
    slot = p[6]
    for start in range(16, 28):
        sA = []
        sB = []
        for i in range(start, len(p)-1, 2):
            bA = (p[i] << 4) | p[i+1]
            bB = (p[i+1] << 4) | p[i]
            if 32 <= bA <= 126: sA.append(chr(bA))
            else: bA = 0
            if 32 <= bB <= 126: sB.append(chr(bB))
            else: bB = 0
            if bA == 0 and bB == 0: break
        if len(sA) >= 4:
            print(f'Slot {slot+1} start {start} Method A: "{"".join(sA)}"')
        if len(sB) >= 4:
            print(f'Slot {slot+1} start {start} Method B: "{"".join(sB)}"')
