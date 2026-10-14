@echo off
setlocal
cd /d "%~dp0"
set "PIDFILE=%~dp0app\bridge.pid"
if not exist "%PIDFILE%" (
  echo MB Livemap is not running.
  pause
  exit /b 0
)
set /p PID=<"%PIDFILE%"
taskkill /PID %PID% /F >nul 2>&1
del "%PIDFILE%" >nul 2>&1
echo MB Livemap is stopped.
pause
