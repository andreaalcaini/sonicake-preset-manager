@echo off
title Sonicake Auto-Sync Converter Server
echo ==================================================
echo   Avvio Sonicake Auto-Sync Converter Microservice
echo ==================================================
cd /d "%~dp0"
python server.py
pause
