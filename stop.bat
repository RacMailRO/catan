@echo off
title Catan v2 - Oprire Joc Local
echo Se opresc serverele Catan v2...

:: Opreste procesele care asculta pe portul 5173 si 3001 daca exista
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5173') do taskkill /f /pid %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001') do taskkill /f /pid %%a >nul 2>&1

echo Serverele au fost oprite.
timeout /t 2 >nul
