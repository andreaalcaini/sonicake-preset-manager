@echo off
title Sonicake SysEx Packet Sniffer
color 0e
echo ======================================================
echo   Sonicake Smart Box - Registratore Pacchetti SysEx
echo ======================================================
echo.
cd /d "%~dp0"
python sniff_import.py
pause
