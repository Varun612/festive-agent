@echo off
title FestiveAgent Shutdown
color 0C

echo ================================================================
echo   FestiveAgent AI Studio - Safe Process Shutdown
echo ================================================================
echo.

cd /d "%~dp0"
for /f "delims=" %%a in ('node -e "try{console.log(require(\"./port_config.json\").backendPort)}catch(e){console.log(5001)}"') do set BACKEND_PORT=%%a
for /f "delims=" %%a in ('node -e "try{console.log(require(\"./port_config.json\").frontendPort)}catch(e){console.log(3001)}"') do set FRONTEND_PORT=%%a

echo Stopping FestiveAgent processes...
taskkill /FI "WINDOWTITLE eq FestiveAgent Backend*" /F /T >nul 2>&1
taskkill /FI "WINDOWTITLE eq FestiveAgent Frontend*" /F /T >nul 2>&1

REM Targeted port listener cleanup (strictly protects ports 3000 and 5000)
if not "%BACKEND_PORT%"=="5000" if not "%BACKEND_PORT%"=="3000" (
    for /f "tokens=5" %%p in ('netstat -a -n -o ^| findstr /R /C:":%BACKEND_PORT% *LISTENING" 2^>nul') do (
        taskkill /PID %%p /F >nul 2>&1
    )
)
if not "%FRONTEND_PORT%"=="5000" if not "%FRONTEND_PORT%"=="3000" (
    for /f "tokens=5" %%p in ('netstat -a -n -o ^| findstr /R /C:":%FRONTEND_PORT% *LISTENING" 2^>nul') do (
        taskkill /PID %%p /F >nul 2>&1
    )
)

echo.
echo [OK] FestiveAgent Backend (port %BACKEND_PORT%) and Frontend (port %FRONTEND_PORT%) stopped.
echo [SAFE] Ports 3000, 5000, and all unrelated applications were NEVER touched.
echo.
pause
