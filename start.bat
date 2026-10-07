@echo off
title Sonicake Smart Box Preset Manager
color 0b
echo ==============================================================
echo       SONICAKE SMART BOX (QME-20) PRESET MANAGER
echo       Neural DSP style PC Editor + Tone3000 Integration
echo ==============================================================
echo.
pushd "%~dp0"
echo Avvio del Microservizio di Compilazione Hardware (Porta 8080)...
start "Sonicake Microservice" cmd /c "server\run_server.bat"
echo.
echo Avvio dell'Applicazione Web (Porta 5173)...
start "" "http://localhost:5173"
call npm run dev
popd
pause

