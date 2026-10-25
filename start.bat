@echo off
title Catan v2 - Pornire Joc Local
cd /d "%~dp0"

echo ==========================================================
echo          CATAN v2 - Platforma de Joc si AI Local
echo ==========================================================
echo.

:: 1. Verificare instalare dependinte
if not exist "node_modules" (
    echo [INFO] Se instaleaza dependintele npm necesare...
    call npm install
    if errorlevel 1 (
        echo [EROARE] Instalarea a esuat. Asigura-te ca ai Node.js instalat.
        pause
        exit /b 1
    )
)

:: 2. Pornire Server Backend (API, WebSocket & SQLite) pe portul 3001 intr-o fereastra dedicata
echo [1/3] Se porneste Serverul Backend pe portul 3001...
start "Catan v2 - Backend Server (Port 3001)" cmd /c "cd /d \"%~dp0\" && npm run dev:server"

:: Asteptam 2 secunde pentru pornirea serverului
timeout /t 2 /nobreak >nul

:: 3. Deschidere automata browser
echo [2/3] Se deschide jocul in browser...
start http://localhost:5173/

:: 4. Pornire Server Vite (Interfata Web pe portul 5173) in fereastra curenta
echo [3/3] Se porneste Interfata Web Vite pe portul 5173...
echo.
echo ==========================================================
echo  Jocul este gata!
echo  - Local: http://localhost:5173/
echo  - Backend API: http://localhost:3001/
echo  - Pentru a opri jocul: inchide ferestrele deschise.
echo ==========================================================
echo.

call npm run dev:web
