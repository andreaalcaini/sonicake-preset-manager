import json

def calculate_crc8(data_bytes):
    crc = 0
    poly = 0x07
    for b in data_bytes:
        crc ^= b
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc << 1) ^ poly) & 0xFF
            else:
                crc = (crc << 1) & 0xFF
    return crc

def build_streaming_packets(binary_data):
    CHUNK_SIZE = 19
    total_packets = (len(binary_data) + CHUNK_SIZE - 1) // CHUNK_SIZE
    packets = []
    for i in range(total_packets):
        start = i * CHUNK_SIZE
        end = min(start + CHUNK_SIZE, len(binary_data))
        chunk = binary_data[start:end]
        chunk_len = len(chunk)

        unexpanded = bytearray([total_packets, i, chunk_len]) + chunk
        crc = calculate_crc8(unexpanded)

        pkt = bytearray(10 + chunk_len * 2)
        pkt[0] = 0xF0
        pkt[1] = (crc >> 4) & 0x0F
        pkt[2] = crc & 0x0F
        pkt[3] = (total_packets >> 4) & 0x0F
        pkt[4] = total_packets & 0x0F
        pkt[5] = (i >> 4) & 0x0F
        pkt[6] = i & 0x0F
        pkt[7] = (chunk_len >> 4) & 0x0F
        pkt[8] = chunk_len & 0x0F

        for j in range(chunk_len):
            b = chunk[j]
            pkt[9 + j*2] = (b >> 4) & 0x0F
            pkt[9 + j*2 + 1] = b & 0x0F

        pkt[-1] = 0xF7
        packets.append(pkt)
    return packets

# Load the reconstructed transfer 1 binary
raw = open('server/transfer1_clone.bin', 'rb').read()
generated = build_streaming_packets(raw)

# Load captured packets
data = json.load(open('server/captured_packets.json'))
captured_stream = [d['hex'] for d in data if d.get('length') in (48, 40, 36)][:146]

print(f"Generated count: {len(generated)}, Captured count: {len(captured_stream)}")

matches = 0
for i in range(len(generated)):
    gen_hex = generated[i].hex().upper()
    cap_hex = captured_stream[i].upper()
    if gen_hex == cap_hex:
        matches += 1
    else:
        print(f"Mismatch at packet {i}:")
        print(f" Gen: {gen_hex}")
        print(f" Cap: {cap_hex}")
        break

print(f"Total matching packets: {matches} / {len(generated)} (100% = {matches == len(generated)})")
