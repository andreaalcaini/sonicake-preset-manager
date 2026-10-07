#!/usr/bin/env bash
# Script di avvio per Sonicake Converter Microservice su Ubuntu / Linux
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=================================================="
echo "  Avvio Sonicake Auto-Sync Converter Microservice"
echo "=================================================="

# Verifica python3
if ! command -v python3 &> /dev/null; then
    echo "Errore: python3 non trovato. Installalo con: sudo apt install python3 python3-pip"
    exit 1
fi

python3 -m pip install -r requirements.txt --quiet
python3 server.py
