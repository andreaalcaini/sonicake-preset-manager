# CLAUDE.md

@AGENTS.md
@STRUCTURE.md

## 🚨 REGOLE PRIORITARIE PER CLAUDE

1. **Sicurezza hardware (pedaliera fisica):**
   Le regole della sezione *Progetto: Regole Hardware Inderogabili* di `AGENTS.md` non si alterano mai senza validazione su pacchetti catturati:
   - Low Model da 2.696 byte;
   - pacchetti da 19 byte con almeno 8 ms tra l'uno e l'altro;
   - 1,2 s di attesa dopo il flash;
   - ACK `14 08 00` per ogni frame di import;
   - nessuna scrittura degli slot interni deve toccare i preset U01-U50.

2. **Cloudflare Tunnel Mesh:**
   Ogni volta che crei o modifichi un `docker-compose.yml`, devi:
   - Inserire il collegamento alla rete esterna `cloudflared-mesh`.
   - Inserire l'alias `aliases: - <nomeservizio>.mesh` (servizio `app` di questo progetto: `sonicake.mesh`, già confermato).
   - **Chiedere SEMPRE all'utente prima di finalizzare:** *"Quale nome desideri utilizzare per l'alias `<nomeservizio>.mesh` nella rete Cloudflare?"*

3. **Docker Multi-Arch Nativo:**
   Usa sempre `--platform=$BUILDPLATFORM` negli stage di build/installazione per evitare il freeze QEMU su ARM64 (Raspberry Pi/Mac). I file vendor Sonicake non entrano mai nell'immagine: si montano da `data/vendor/`.

4. **GitHub CI/CD & GHCR:**
   Solo Classic PAT (`ghp_...`) con scope `write:packages` e `repo`. Non usare mai Fine-Grained tokens (`github_pat_...`).
