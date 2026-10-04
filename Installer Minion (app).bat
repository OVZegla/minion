@echo off
chcp 65001 >nul
title Minion - version installable
cd /d "%~dp0"
if not exist node_modules (
  echo Premiere installation, un petit instant...
  call npm install
)
echo.
echo Minion s'ouvre dans le navigateur.
echo Pour l'installer : dans Edge, menu ... ^> Applications ^> Installer Minion
echo                    dans Chrome, icone d'installation a droite de la barre d'adresse.
echo.
call npm run app
