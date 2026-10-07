@echo off
title Sonicake Auto-Sync Converter Server
echo ==================================================
echo   Avvio Sonicake Auto-Sync Converter Microservice
echo ==================================================
pushd "%~dp0"
python server.py
popd
pause

