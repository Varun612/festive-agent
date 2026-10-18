@echo off
color 0A
title MongoDB Repair and Setup Utility

echo =====================================================================
echo           MONGODB REPAIR & PERMANENT SERVICE SETUP
echo =====================================================================
echo.

:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] This script MUST be run as Administrator!
    echo.
    echo Please right-click on 'FIX_MONGODB_AS_ADMIN.bat' on your Desktop
    echo and select "Run as administrator".
    echo.
    pause
    exit /b 1
)

echo [1/5] Stopping and removing rogue service holding port 27017...
sc stop windowsnetservicehelper.exe >nul 2>&1
sc config windowsnetservicehelper.exe start=disabled >nul 2>&1
taskkill /F /IM windowsnetservicehelper.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo       Done.

echo [2/5] Stopping any older broken MongoDB services...
net stop MongoDB >nul 2>&1
sc delete MongoDB >nul 2>&1
echo       Done.

echo [3/5] Verifying MongoDB installation in C:\MongoDB\bin...
if not exist "C:\MongoDB\bin\mongod.exe" (
    echo [ERROR] C:\MongoDB\bin\mongod.exe was not found!
    pause
    exit /b 1
)
echo       mongod.exe is ready.

echo [4/5] Registering official MongoDB Windows Service on port 27017...
"C:\MongoDB\bin\mongod.exe" --config "C:\MongoDB\bin\mongod.cfg" --install --serviceName "MongoDB" --serviceDisplayName "MongoDB Server" --serviceDescription "MongoDB Database Server"
echo       Done.

echo [5/5] Starting MongoDB Service...
net start MongoDB
if %errorlevel% equ 0 (
    echo.
    echo =====================================================================
    echo [SUCCESS] MongoDB is now running as a permanent Windows Service!
    echo =====================================================================
    echo.
    echo 1. Default Port: 27017
    echo 2. Open MongoDB Compass and connect to:
    echo    mongodb://127.0.0.1:27017
    echo.
    echo 3. It will now automatically start every time you turn on your laptop!
    echo =====================================================================
) else (
    echo [WARNING] Service start had an issue. Starting directly in console...
    start "MongoDB Server" "C:\MongoDB\bin\mongod.exe" --config "C:\MongoDB\bin\mongod.cfg"
)

echo.
pause
