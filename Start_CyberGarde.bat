@echo off
title Cyber Garde Launcher
cd /d "D:\myportfolio-acl-recovery\cybergarde-backend"
start "CyberGarde Backend" cmd /k "uvicorn main:app --host 0.0.0.0 --port 8000"
cd /d "D:\myportfolio-acl-recovery\cybergarde-frontend"
start "CyberGarde Frontend" cmd /k "npm run dev"
timeout /t 5 /nobreak >nul
start http://localhost:5173
exit