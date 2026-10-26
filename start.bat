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

if not exist "logs" mkdir "logs" >nul 2>nul

:: Serverele de mai jos ruleaza in fundal (fara fereastra proprie) — daca jocul a fost
:: oprit anterior prin inchiderea directa a ferestrei (in loc de o apasare de tasta),
:: procesele raman "orfane" si blocheaza porturile 3001/5173 la urmatoarea pornire.
:: Le eliberam preventiv aici, ca scriptul sa fie sigur de rulat de mai multe ori la rand.
echo [INFO] Se elibereaza porturile 3001 si 5173 (daca erau ocupate de o rulare anterioara)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001,5173 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>nul

:: 2+3. Pornire Backend si Web in fundal, fara fereastra proprie.
:: NOTA: pe Windows 11, cu "Windows Terminal" setat ca aplicatie implicita de terminal,
:: vechiul "start "Titlu" cmd /c ..." poate esua silentios (deschide ferestre goale,
:: fara sa porneasca procesul cerut). Start-Process din PowerShell este robust indiferent
:: de aceasta setare, asa ca il folosim in loc, fara fereastra vizibila (-WindowStyle Hidden),
:: cu output redirectat in logs\*.log pentru depanare.
echo [1/4] Se porneste Serverul Backend pe portul 3001 (fundal)...
set BACKEND_PID=
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "(Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev:server ^> logs\backend.log 2^>^&1' -WorkingDirectory '%~dp0' -WindowStyle Hidden -PassThru).Id"`) do set BACKEND_PID=%%P

echo [2/4] Se porneste Interfata Web Vite pe portul 5173 (fundal)...
set WEB_PID=
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "(Start-Process -FilePath 'cmd.exe' -ArgumentList '/c','npm run dev:web ^> logs\web.log 2^>^&1' -WorkingDirectory '%~dp0' -WindowStyle Hidden -PassThru).Id"`) do set WEB_PID=%%P

if "!BACKEND_PID!"=="" (
    echo [EROARE] Nu am putut porni Serverul Backend. Verifica logs\backend.log
    pause
    exit /b 1
)
if "!WEB_PID!"=="" (
    echo [EROARE] Nu am putut porni Interfata Web. Verifica logs\web.log
    pause
    exit /b 1
)

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

echo [ATENTIE] Serverele nu au raspuns in 60 de secunde.
echo           Verifica logs\backend.log si logs\web.log pentru erori.
echo           Se deschide browserul oricum — reincarca pagina (F5) daca vezi erori.
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
echo  - Loguri: logs\backend.log si logs\web.log
echo.
echo  Apasa orice tasta in aceasta fereastra pentru a OPRI jocul
echo  (inchide Backend-ul si Interfata Web pornite in fundal).
echo ==========================================================
echo.
pause >nul

echo Se opresc serverele...
if not "!BACKEND_PID!"=="" taskkill /F /T /PID !BACKEND_PID! >nul 2>nul
if not "!WEB_PID!"=="" taskkill /F /T /PID !WEB_PID! >nul 2>nul
echo Oprit. Poti inchide aceasta fereastra.
pause >nul
