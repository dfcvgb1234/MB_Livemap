@echo off
netsh advfirewall firewall delete rule name="MB Livemap Dashboard" >nul 2>&1
netsh advfirewall firewall delete rule name="MB Livemap WebSocket" >nul 2>&1
netsh advfirewall firewall add rule name="MB Livemap Dashboard" dir=in action=allow protocol=TCP localport=43127
netsh advfirewall firewall add rule name="MB Livemap WebSocket" dir=in action=allow protocol=TCP localport=18766
if errorlevel 1 (
  echo Could not add the firewall rules.
  pause
  exit /b 1
)
echo Allowed inbound TCP 43127 and 18766.
