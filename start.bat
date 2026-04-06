@echo off
title Modbus TCP Test Page - Start
cd /d "%~dp0"

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"

where node >nul 2>&1
if not %errorlevel%==0 (
  echo Node.js was not found. Running install.bat first...
  call install.bat
  if errorlevel 1 exit /b 1
)

if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\nodejs\node.exe" set "PATH=%LocalAppData%\Programs\nodejs;%PATH%"

where npm >nul 2>&1
if not %errorlevel%==0 (
  echo npm was not found. Please run install.bat again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo node_modules folder was not found. Running install.bat first...
  call install.bat
  if errorlevel 1 exit /b 1
)

call npm start
if errorlevel 1 (
  echo.
  echo Server failed to start. Please check the error message above.
  pause
  exit /b 1
)
