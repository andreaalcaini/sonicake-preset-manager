# Sonicake NAM Compiler ⚡

Microservizio Flask che converte i profili **Neural Amp Modeler (.nam)** nel **Low Model Clone AMP da 2.696 byte** accettato dalla pedaliera. Pipeline completa, endpoint e variabili d'ambiente: [STRUCTURE.md](../STRUCTURE.md).

---

## 🪟 Sviluppo locale su Windows (backend `dll`)

Usa la `5868USB.dll` inclusa e il WAV di eccitazione dell'installazione di Sonicake Manager.

```cmd
:: dalla root del repository: compiler + sito insieme
npm run dev
:: solo il compiler
npm run dev:backend
```

Il server risponde su `http://localhost:8080`; il dev server Vite inoltra `/api` a questa porta. La cache delle conversioni sta in `data/cache/`, come in produzione.
Verifica: `curl http://localhost:8080/api/health` → `compiler_backend: "dll"`.

---

## 🐧 Produzione Linux ARM64 (backend `nam2clo`)

Il `Dockerfile` nella root del repository produce un'unica immagine con sito e compiler (`ghcr.io/andreaalcaini/sonicake-preset-manager`, pubblicata dalla CI a ogni push su `master`). La conversione usa la build Android della libreria Sonicake: i file vendor sono proprietari e **non sono né nel repository né nell'immagine**.

1. **Estrai i file vendor** dall'APK SonicLink, dalla root del repository:
   ```powershell
   .\backend\nam2clo\extract-vendor.ps1 -SplitApk ...\split_config.arm64_v8a.apk -BaseApk ...\SONICLINK.apk
   ```
   Il risultato finisce in `data/vendor/`: `lib5868USB.so`, `libc++_shared.so`, `nam_input_wav.wav`.
2. **Copiali sul server** in `./data/vendor/` (accanto a `docker-compose.yml`), poi `sudo chown -R 1001:1001 data`.
3. **Avvia**: `docker compose pull && docker compose up -d`.
4. **Verifica**: `curl http://127.0.0.1:3010/api/health` → `compiler_backend: "nam2clo"`.
