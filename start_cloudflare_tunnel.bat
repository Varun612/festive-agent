@echo off
title FestiveAgent AI Cloudflare Tunnel
color 0B

cd /d "%~dp0"
for /f "tokens=*" %%a in ('node -e "try{console.log(require('./port_config.json').backendPort||5001)}catch(e){console.log(5001)}"') do set BACKEND_PORT=%%a

echo ================================================================
echo   Starting Cloudflare Tunnel for FestiveAgent AI on port %BACKEND_PORT%...
echo   (Ports 3000 and 5000 strictly protected and untouched)
echo ================================================================
echo.

cloudflared.exe tunnel --url http://localhost:%BACKEND_PORT% --no-autoupdate
pause
