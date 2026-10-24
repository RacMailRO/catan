@echo off
:: Auto-elevate to Administrator so Windows Defender Firewall allows LAN access on ports 5173 and 3001
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitare drepturi de Administrator pentru deschiderea porturilor LAN 5173 si 3001 in Windows Firewall...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Adaugare regula Inbound in Windows Defender Firewall pentru Catan LAN (porturile 5173 si 3001)...
netsh advfirewall firewall delete rule name="Catan LAN 5173-3001" >nul 2>&1
netsh advfirewall firewall add rule name="Catan LAN 5173-3001" dir=in action=allow protocol=TCP localport=5173,3001 profile=any

echo.
echo [OK] Porturile 5173 si 3001 sunt acum deschise in Windows Firewall!
echo Poti accesa aplicatia de pe telefon la: http://192.168.100.53:5173/
pause
