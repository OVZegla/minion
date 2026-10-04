@echo off
chcp 65001 >nul
title Minion
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js n'est pas installe. Installe-le depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Premiere installation, un petit instant...
  call npm install
)
echo Minion demarre... (ferme cette fenetre pour arreter)
start "" http://localhost:5173
call npm run dev
