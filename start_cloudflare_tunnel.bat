@echo off
title FestiveAgent AI Cloudflare Tunnel
color 0B
echo Starting Cloudflare Tunnel for FestiveAgent AI Studio on port 5000...
cd /d "c:\Users\info\Desktop\festive-agent"
cloudflared.exe tunnel --url http://localhost:5000 --no-autoupdate
pause
