#!/usr/bin/env python3
"""
Sonicake SysEx Packet Sniffer & Protocol Recorder
Attaches to Sonicake Manager and intercepts all MIDI SysEx packets
sent and received via WINMM.dll / 5868USB.dll.
Saves captured packets to 'captured_packets.json' for analysis.
"""

import os
import sys
import time
import json
import frida

# Output: first argument, otherwise a new timestamped file (never overwrite older captures)
OUTPUT_FILE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), time.strftime('capture_%Y%m%d_%H%M%S.json'))
EXE_PATH = r"C:\Program Files\Sonicake\Sonicake Manager\Sonicake Manager.exe"

captured_packets = []

JS_HOOK = """
const winmm = Process.getModuleByName("WINMM.dll");
const midiOutLongMsg = winmm.getExportByName("midiOutLongMsg");

console.log("[*] Interceptor agganciato a WINMM.dll -> midiOutLongMsg");

// Struct MIDIHDR { LPSTR lpData; DWORD dwBufferLength; DWORD dwBytesRecorded; ... }
Interceptor.attach(midiOutLongMsg, {
    onEnter: function(args) {
        const hdr = args[1];
        if (hdr.isNull()) return;

        const lpData = hdr.readPointer();
        const dwBufferLength = hdr.add(Process.pointerSize).readU32();

        if (!lpData.isNull() && dwBufferLength > 0) {
            const bytes = lpData.readByteArray(dwBufferLength);
            const u8 = new Uint8Array(bytes);
            let hex = "";
            for (let i = 0; i < u8.length; i++) {
                hex += u8[i].toString(16).padStart(2, '0').toUpperCase();
            }

            send({
                direction: "OUT",
                length: dwBufferLength,
                hex: hex,
                preview: hex.length > 80 ? hex.substring(0, 80) + "..." : hex
            });
        }
    }
});

// Hook midiOutShortMsg for short commands
const midiOutShortMsg = winmm.getExportByName("midiOutShortMsg");
if (midiOutShortMsg) {
    Interceptor.attach(midiOutShortMsg, {
        onEnter: function(args) {
            const dwMsg = args[1].toUInt32();
            const b0 = (dwMsg & 0xFF).toString(16).padStart(2, '0').toUpperCase();
            const b1 = ((dwMsg >> 8) & 0xFF).toString(16).padStart(2, '0').toUpperCase();
            const b2 = ((dwMsg >> 16) & 0xFF).toString(16).padStart(2, '0').toUpperCase();
            send({
                direction: "OUT_SHORT",
                length: 3,
                hex: b0 + b1 + b2,
                preview: b0 + " " + b1 + " " + b2
            });
        }
    });
}

// Also hook midiInOpen to capture incoming ACKs from the pedalboard
const midiInOpen = winmm.getExportByName("midiInOpen");
if (midiInOpen) {
    Interceptor.attach(midiInOpen, {
        onEnter: function(args) {
            const cbPtr = args[2];
            const fdwOpen = args[4].toInt32();
            if (!cbPtr.isNull() && (fdwOpen & 0x30000)) {
                try {
                    Interceptor.attach(cbPtr, {
                        onEnter: function(cbArgs) {
                            const wMsg = cbArgs[1].toInt32();
                            if (wMsg === 0x3C4) { // MIM_LONGDATA
                                const hdr = cbArgs[3];
                                if (!hdr.isNull()) {
                                    const lpData = hdr.readPointer();
                                    const dwBytesRecorded = hdr.add(12).readU32();
                                    if (!lpData.isNull() && dwBytesRecorded > 0) {
                                        const bytes = lpData.readByteArray(dwBytesRecorded);
                                        const u8 = new Uint8Array(bytes);
                                        let hex = "";
                                        for (let i = 0; i < u8.length; i++) {
                                            hex += u8[i].toString(16).padStart(2, '0').toUpperCase();
                                        }
                                        send({
                                            direction: "IN",
                                            length: dwBytesRecorded,
                                            hex: hex,
                                            preview: hex.length > 80 ? hex.substring(0, 80) + "..." : hex
                                        });
                                    }
                                }
                            }
                        }
                    });
                } catch (e) {
                    console.log("[!] Errore hook callback MIDI IN: " + e);
                }
            }
        }
    });
}
"""

def on_message(message, data):
    if message['type'] == 'send':
        payload = message['payload']
        payload['timestamp'] = time.time()
        captured_packets.append(payload)
        direction = payload.get('direction', 'OUT')
        length = payload.get('length', 0)
        hex_data = payload.get('hex', '')
        
        preview = hex_data[:60] + ('...' if len(hex_data) > 60 else '')
        print(f"[{direction}] {length:4d} bytes | {preview}", flush=True)
        
        # Save incrementally
        try:
            with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                json.dump(captured_packets, f, indent=2)
        except Exception:
            pass
    else:
        print("[FRIDA MSG]", message, flush=True)

def main():
    print("=" * 60, flush=True)
    print("   Sonicake Smart Box - SysEx Flasher Sniffer", flush=True)
    print("=" * 60, flush=True)
    print(f"[*] File di output: {OUTPUT_FILE}", flush=True)

    device = frida.get_local_device()
    session = None

    print("[*] Cerco processo Sonicake Manager...", flush=True)
    while not session:
        for p in device.enumerate_processes():
            if "sonicake manager" in p.name.lower():
                try:
                    print(f"[*] Trovato processo attivo: {p.name} (PID: {p.pid}). Mi collego...", flush=True)
                    session = frida.attach(p.pid)
                    break
                except Exception as e:
                    print(f"[!] Errore collegamento a PID {p.pid}: {e}", flush=True)
        if not session:
            print("[*] In attesa che Sonicake Manager venga aperto... (aprilo adesso)", flush=True)
            time.sleep(2)

    script = session.create_script(JS_HOOK)
    script.on('message', on_message)
    script.load()

    print("\n" + "=" * 60)
    print(" >>> SNIFFER ATTIVO IN ASCOLTO! <<<")
    print(" Ora esegui l'operazione su Sonicake Manager (es. carica un NAM / IR,")
    print(" oppure Rename Clone / Rename IR su uno slot).")
    print(" Appena termina, premi CTRL+C in questa finestra.")
    print("=" * 60 + "\n")

    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        print(f"\n[*] Cattura terminata! Totale pacchetti registrati: {len(captured_packets)}")
        print(f"[*] I pacchetti sono salvati in: {OUTPUT_FILE}")
        session.detach()

if __name__ == '__main__':
    main()
