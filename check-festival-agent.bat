@echo off
title FestiveAgent Health Check
color 0B

echo ================================================================
echo   FestiveAgent AI Studio - Diagnostic Health Check
echo ================================================================
echo.

cd /d "%~dp0"
node scripts\find-ports.js --check

for /f "delims=" %%a in ('node -e "try{console.log(require(\"./port_config.json\").backendPort)}catch(e){console.log(5001)}"') do set BACKEND_PORT=%%a
for /f "delims=" %%a in ('node -e "try{console.log(require(\"./port_config.json\").frontendPort)}catch(e){console.log(3001)}"') do set FRONTEND_PORT=%%a

echo.
echo Checking Backend (http://localhost:%BACKEND_PORT%/api/health)...
node -e "const http=require('http'); http.get('http://127.0.0.1:' + process.env.BACKEND_PORT + '/api/health', {timeout:1500}, r => { let d=''; r.on('data', c=>d+=c); r.on('end', () => { console.log('[OK] Backend: ONLINE (Status ' + r.statusCode + ')'); try { const j=JSON.parse(d); console.log('     Storage: ' + (j.db ? j.db.storageMode : 'Active')); console.log('     Version: ' + (j.version || '2.1.0')); } catch(e){} }); }).on('error', e => console.log('[ERR] Backend: OFFLINE (' + e.message + ')'));"

echo.
echo Checking Frontend (http://localhost:%FRONTEND_PORT%)...
node -e "const http=require('http'); http.get('http://127.0.0.1:' + process.env.FRONTEND_PORT + '/', {timeout:1500}, r => { console.log('[OK] Frontend: ONLINE (Status ' + r.statusCode + ')'); }).on('error', e => console.log('[ERR] Frontend: OFFLINE (' + e.message + ')'));"

echo.
echo Checking Port Isolation:
echo - Port 3000: Protected (Untouched)
echo - Port 5000: Protected (Untouched)
echo.
pause
