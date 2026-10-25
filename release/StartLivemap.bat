@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found on PATH.
  echo Install it from https://nodejs.org, then run this again.
  pause
  exit /b 1
)

if not exist "server\package.json" (
  echo Keep this file inside the release folder of the MB Livemap project.
  pause
  exit /b 1
)

set "DEPS_UPDATED="
call :ensure_npm_deps "%~dp0..\server" "bridge"
if errorlevel 1 exit /b 1
call :ensure_npm_deps "%~dp0..\web" "dashboard"
if errorlevel 1 exit /b 1

netsh advfirewall firewall show rule name="MB Livemap Dashboard" | findstr /C:"MB Livemap Dashboard" >nul
if errorlevel 1 (
  echo Allowing the tablet through Windows Firewall. Accept the prompt.
  powershell -NoProfile -Command "Start-Process -FilePath '%~dp0AllowLanFirewall.bat' -Verb RunAs -Wait"
)

curl.exe -sf -o nul --max-time 2 http://127.0.0.1:18767/health >nul 2>&1
if errorlevel 1 (
  echo Starting the bridge...
  start "MB Livemap Bridge" /D "%~dp0..\server" cmd /k npm.cmd start
) else (
  echo Bridge is already running.
)

curl.exe -sf -o nul --max-time 2 http://127.0.0.1:43127 >nul 2>&1
if errorlevel 1 (
  echo Starting the dashboard...
  start "MB Livemap Web" /D "%~dp0..\web" cmd /k npm.cmd run dev
) else (
  echo Dashboard is already running.
  if defined DEPS_UPDATED (
    echo Close the MB Livemap Web window and run this again so it picks up the updated Next.js.
  )
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
echo On your tablet, same Wi-Fi, open:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' -and $_.InterfaceAlias -notmatch 'WSL|Nord|VPN|vEthernet|Hyper-V|Virtual' } | ForEach-Object { '  http://' + $_.IPAddress + ':43127' }"
echo.
echo Leave the Bridge and Web windows open while you play.
echo If the tablet cannot connect, allow the MB Livemap firewall rules for Private networks.
echo.
pause
exit /b 0

:ensure_npm_deps
set "DEP_DIR=%~1"
set "DEP_LABEL=%~2"
if not exist "%DEP_DIR%\node_modules\.package-lock.json" goto install_npm_deps
powershell -NoProfile -Command "exit [int]((Get-Item -LiteralPath '%DEP_DIR%\package.json').LastWriteTimeUtc -gt (Get-Item -LiteralPath '%DEP_DIR%\node_modules\.package-lock.json').LastWriteTimeUtc -or (Get-Item -LiteralPath '%DEP_DIR%\package-lock.json').LastWriteTimeUtc -gt (Get-Item -LiteralPath '%DEP_DIR%\node_modules\.package-lock.json').LastWriteTimeUtc)"
if errorlevel 1 goto install_npm_deps
exit /b 0

:install_npm_deps
echo Installing %DEP_LABEL% dependencies...
pushd "%DEP_DIR%"
call npm.cmd install
if errorlevel 1 (
  echo %DEP_LABEL% install failed.
  popd
  pause
  exit /b 1
)
popd
set "DEPS_UPDATED=1"
exit /b 0
