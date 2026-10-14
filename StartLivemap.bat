@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install it from https://nodejs.org, then run this again.
  pause
  exit /b 1
)

if not exist "server\package.json" (
  echo Keep this file in the MB Livemap folder, next to the server and web folders.
  pause
  exit /b 1
)

if not exist "server\node_modules\" (
  echo Installing bridge dependencies...
  pushd "%~dp0server"
  call npm.cmd install
  if errorlevel 1 (
    echo Bridge install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

if not exist "web\node_modules\" (
  echo Installing dashboard dependencies...
  pushd "%~dp0web"
  call npm.cmd install
  if errorlevel 1 (
    echo Dashboard install failed.
    popd
    pause
    exit /b 1
  )
  popd
)

netsh advfirewall firewall show rule name="MB Livemap Dashboard" | findstr /C:"MB Livemap Dashboard" >nul
if errorlevel 1 (
  echo Allowing the iPad through Windows Firewall. Accept the prompt.
  powershell -NoProfile -Command "Start-Process -FilePath '%~dp0AllowLanFirewall.bat' -Verb RunAs -Wait"
)

curl.exe -sf -o nul --max-time 2 http://127.0.0.1:18767/health >nul 2>&1
if errorlevel 1 (
  echo Starting the bridge...
  start "MB Livemap Bridge" /D "%~dp0server" cmd /k npm.cmd start
) else (
  echo Bridge is already running.
)

curl.exe -sf -o nul --max-time 2 http://127.0.0.1:43127 >nul 2>&1
if errorlevel 1 (
  echo Starting the dashboard...
  start "MB Livemap Web" /D "%~dp0web" cmd /k npm.cmd run dev
) else (
  echo Dashboard is already running.
)

echo Waiting for http://127.0.0.1:43127 ...
set /a TRIES=0
:wait_web
set /a TRIES+=1
curl.exe -sf -o nul --max-time 2 http://127.0.0.1:43127 >nul 2>&1
if not errorlevel 1 goto open_browser
if %TRIES% geq 40 goto open_browser
timeout /t 1 /nobreak >nul
goto wait_web

:open_browser
start "" "http://127.0.0.1:43127"
echo.
echo On this PC:  http://127.0.0.1:43127
echo On your iPad, same Wi-Fi, open:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' -and $_.InterfaceAlias -notmatch 'WSL|Nord|VPN|vEthernet|Hyper-V|Virtual' } | ForEach-Object { '  http://' + $_.IPAddress + ':43127' }"
echo.
echo Leave the Bridge and Web windows open while you play.
echo If the iPad cannot connect, allow the MB Livemap firewall rules for Private networks.
echo.
pause
