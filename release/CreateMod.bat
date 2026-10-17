@echo off
setlocal

rem Compress-Archive writes src\File.lua. FS25 only loads src/File.lua.
set "FOLDER=%~dp0mod"
set "ZIP=%~dp0FS25_MB_Livemap.zip"

where tar >nul 2>&1
if errorlevel 1 (
  echo tar.exe was not found. It ships with Windows 10 and later.
  pause
  exit /b 1
)

if exist "%ZIP%" del "%ZIP%"

pushd "%FOLDER%" || (
  echo Could not open "%FOLDER%".
  pause
  exit /b 1
)
tar --format=zip -cf "%ZIP%" *
set "TAR_ERR=%ERRORLEVEL%"
popd

if not "%TAR_ERR%"=="0" (
  echo Failed to create "%ZIP%".
  pause
  exit /b %TAR_ERR%
)

echo Done: %ZIP%
pause
