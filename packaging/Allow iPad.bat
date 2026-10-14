@echo off
netsh advfirewall firewall delete rule name="MB Livemap" >nul 2>&1
netsh advfirewall firewall add rule name="MB Livemap" dir=in action=allow protocol=TCP localport=43127 profile=private
if errorlevel 1 (
  echo Could not allow the iPad through Windows Firewall.
  exit /b 1
)
echo Allowed the livemap on private networks, port 43127.
