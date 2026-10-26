@echo off
setlocal enabledelayedexpansion
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
echo [1/4] Se porneste Serverul Backend pe portul 3001...
start "Catan v2 - Backend Server (Port 3001)" cmd /c "cd /d \"%~dp0\" && npm run dev:server"

:: 3. Pornire Server Vite (Interfata Web) pe portul 5173 intr-o fereastra dedicata
echo [2/4] Se porneste Interfata Web Vite pe portul 5173...
start "Catan v2 - Web (Vite, Port 5173)" cmd /c "cd /d \"%~dp0\" && npm run dev:web"

:: 4. Asteptam efectiv pornirea celor 2 servere (nu doar un timp fix) ca sa evitam
::    erorile 500 care apar daca browserul face cereri API inainte ca serverul sa asculte.
echo [3/4] Se asteapta pornirea serverelor...

set BACKEND_READY=0
set WEB_READY=0

for /l %%i in (1,1,60) do (
    if "!BACKEND_READY!"=="0" (
        curl -s -o nul -f http://localhost:3001/api/version >nul 2>nul
        if not errorlevel 1 set BACKEND_READY=1
    )
    if "!WEB_READY!"=="0" (
        curl -s -o nul -f http://localhost:5173/ >nul 2>nul
        if not errorlevel 1 set WEB_READY=1
    )
    if "!BACKEND_READY!"=="1" if "!WEB_READY!"=="1" goto :ready
    timeout /t 1 /nobreak >nul
)

echo [ATENTIE] Serverele nu au raspuns in 60 de secunde — se deschide browserul oricum.
echo           Daca vezi erori, mai asteapta cateva secunde si reincarca pagina (F5).
goto :open

:ready
echo [OK] Ambele servere raspund.

:open
:: 5. Deschidere automata browser (abia dupa ce serverele sunt pregatite)
echo [4/4] Se deschide jocul in browser...
start http://localhost:5173/

echo.
echo ==========================================================
echo  Jocul este gata!
echo  - Local: http://localhost:5173/
echo  - Backend API: http://localhost:3001/
echo  - Pentru a opri jocul: inchide cele 2 ferestre deschise
echo    (Backend Server si Web/Vite).
echo ==========================================================
echo.
pause
