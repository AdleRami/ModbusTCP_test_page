@echo off
title Modbus TCP Test Page - Install
setlocal
cd /d "%~dp0"

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"

echo [1/3] Checking Node.js...
where node >nul 2>&1
if %errorlevel%==0 goto node_ready

echo Node.js was not found on this PC.
echo Trying to install Node.js LTS automatically with winget...

where winget >nul 2>&1
if not %errorlevel%==0 (
  echo.
  echo Automatic Node.js installation could not start because winget is not available.
  echo Please install Node.js LTS manually from https://nodejs.org/ and run install.bat again.
  pause
  exit /b 1
)

winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo.
  echo Node.js automatic installation failed.
  echo Please install Node.js LTS manually from https://nodejs.org/ and run install.bat again.
  pause
  exit /b 1
)

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"

where node >nul 2>&1
if not %errorlevel%==0 (
  echo.
  echo Node.js was installed, but this command window cannot find it yet.
  echo Close this window and run install.bat once more.
  pause
  exit /b 1
)

:node_ready
echo Node.js detected.
node -v
where npm >nul 2>&1
if not %errorlevel%==0 (
  echo.
  echo npm command was not found. Please reinstall Node.js LTS and try again.
  pause
  exit /b 1
)
call npm -v

echo.
echo [2/3] Installing project packages...
call npm install

if errorlevel 1 (
  echo.
  echo Project package installation failed.
  echo Please check your network connection and npm settings, then try again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo npm install finished, but node_modules was not created.
  echo Please check npm output above and try again.
  pause
  exit /b 1
)

echo.
echo [3/3] Installation completed successfully.
echo You can now run start.bat
pause
