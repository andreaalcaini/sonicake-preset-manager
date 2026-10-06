@echo off
title Sonicake Smart Box Preset Manager
color 0b
echo ==============================================================
echo       SONICAKE SMART BOX (QME-20) PRESET MANAGER
echo       Neural DSP style PC Editor + Tone3000 Integration
echo ==============================================================
echo.
echo Starting local application server...
echo.

start "" "http://localhost:5173"
call npm run dev

pause
