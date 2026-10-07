# Sonicake Auto-Sync Converter Microservice ⚡

Microservizio leggero per la conversione automatica di catture **Neural Amp Modeler (.nam)** nel formato binario hardware proprietario di Sonicake **(.namb)** con intestazione DSP `BMAN`, e la preparazione di **Cabinet IR (.wav)**.

---

## 🚀 Come testare ADESSO su Windows 10

Il server è già configurato e funzionante con la libreria nativa `5868USB.dll` inclusa.

1. Apri una finestra terminale o fai doppio click su:
   ```cmd
   run_server.bat
   ```
   oppure esegui manualmente:
   ```cmd
   python server.py
   ```
2. Il server risponderà su `http://localhost:8080`.
3. Nel Sonicake Preset Manager (browser), vedrai l'indicatore **🟢 Server Compilatore VPS / Locale: Connesso**. Quando clicchi su un modello di Tone3000, verrà compilato al volo in formato hardware `.namb` in meno di 0.2 secondi!

---

## 🐧 Come distribuire su Ubuntu ARM (VPS / Home Server)

### Metodo 1: Esecuzione Diretta con Python & Systemd (Consigliato)

1. **Copia la cartella `server` sulla tua VPS Ubuntu ARM:**
   ```bash
   scp -r server user@tuo-server-arm:/opt/sonicake-bridge
   ```

2. **Accedi alla VPS e installa i prerequisiti:**
   ```bash
   ssh user@tuo-server-arm
   cd /opt/sonicake-bridge
   sudo apt update
   sudo apt install -y python3 python3-pip
   pip3 install -r requirements.txt
   ```

   > 💡 **Nota Libreria Nativa per Linux ARM64:** La cartella include `5868USB.dll` (per Windows x64). Su Linux Ubuntu ARM64 (VPS o Raspberry Pi), il server cerca automaticamente `lib5868USB.so`. Puoi estrarre direttamente `lib5868USB.so` dall'APK Android ufficiale Sonicake (trovi il file in `lib/arm64-v8a/lib5868USB.so`) e inserirlo nella cartella `/opt/sonicake-bridge/`!

3. **Crea un servizio Systemd per avvio automatico (24/7):**
   ```bash
   sudo nano /etc/systemd/system/sonicake-bridge.service
   ```
   Incolla la seguente configurazione:
   ```ini
   [Unit]
   Description=Sonicake Auto-Sync Converter Microservice
   After=network.target

   [Service]
   Type=simple
   User=ubuntu
   WorkingDirectory=/opt/sonicake-bridge
   ExecStart=/usr/bin/python3 /opt/sonicake-bridge/server.py
   Restart=always
   RestartSec=5
   Environment=PORT=8080

   [Install]
   WantedBy=multi-user.target
   ```

4. **Avvia il servizio:**
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now sonicake-bridge
   sudo systemctl status sonicake-bridge
   ```

---

### Metodo 2: Esecuzione con Docker su Ubuntu ARM

1. **Build e avvio del container:**
   ```bash
   docker build -t sonicake-bridge .
   docker run -d --name sonicake-bridge --restart always -p 8080:8080 sonicake-bridge
   ```

2. **Verifica funzionamento:**
   ```bash
   curl http://localhost:8080/api/health
   ```
   Risposta:
   ```json
   {
     "status": "ok",
     "service": "sonicake-bridge-converter",
     "compiler_available": true
   }
   ```

---

## 🌐 Configurazione Reverse Proxy Nginx & HTTPS (Opzionale)

Se hai un dominio pubblico (es. `converter.tuodominio.com`):

```nginx
server {
    server_name converter.tuodominio.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Abilita SSL con Certbot:
```bash
sudo certbot --nginx -d converter.tuodominio.com
```

Infine, nella dashboard del **Sonicake Preset Manager**, imposta l'indirizzo del server su `https://converter.tuodominio.com`!
