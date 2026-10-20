@echo off
title FestiveAgent Launcher
color 0A

echo ================================================================
echo   FestiveAgent AI Studio - Clean-Canvas Autonomous Director
echo ================================================================
echo.

cd /d "%~dp0"

REM 1. Discover safe ports dynamically (Strictly avoiding 3000 and 5000)
node scripts\find-ports.js
if errorlevel 1 (
    echo [ERROR] Port discovery failed!
    pause
    exit /b 1
)

REM 2. Read selected ports
for /f "delims=" %%a in ('node -e "try{console.log(require(\"./port_config.json\").backendPort)}catch(e){console.log(5001)}"') do set BACKEND_PORT=%%a
for /f "delims=" %%a in ('node -e "try{console.log(require(\"./port_config.json\").frontendPort)}catch(e){console.log(3001)}"') do set FRONTEND_PORT=%%a

echo.
echo [1/3] Checking if FestiveAgent is already running...
node -e "const http=require('http'); http.get('http://127.0.0.1:' + process.env.BACKEND_PORT + '/api/health', {timeout:1200}, r => { process.exit(r.statusCode===200 ? 0 : 1); }).on('error', () => process.exit(1));" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] FestiveAgent is ALREADY RUNNING and healthy!
    goto SHOW_STATUS
)

echo [2/3] Starting Backend Server on port %BACKEND_PORT%...
powershell -Command "Start-Process node -ArgumentList 'server.js' -WorkingDirectory '%~dp0backend' -WindowStyle Hidden"

echo [3/3] Starting Frontend Server on port %FRONTEND_PORT%...
powershell -Command "Start-Process node -ArgumentList 'scripts\serve-frontend.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"

echo Waiting for services to initialize...
ping 127.0.0.1 -n 4 >nul

:SHOW_STATUS
echo.
echo ================================================================
echo   FestiveAgent AI Studio Started Successfully!
echo.
echo   Frontend URL: http://localhost:%FRONTEND_PORT%
echo   Backend API:  http://localhost:%BACKEND_PORT%
echo   Protected:    Ports 3000 and 5000 are untouched and reserved
echo   Logs:         backend.log and frontend.log
echo ================================================================
echo.

start "" "http://localhost:%FRONTEND_PORT%"
echo Press any key to exit launcher (services keep running in background)...
pause >nul
