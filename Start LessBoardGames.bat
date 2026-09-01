@echo off
setlocal
title LessBoardGames

cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
    echo Node.js and npm are required to start LessBoardGames.
    echo Install Node.js, then run this launcher again.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo Installing LessBoardGames dependencies...
    call npm install
    if errorlevel 1 goto :failed
)

set "OPEN_ARG=--open"
if /i "%~1"=="--no-open" set "OPEN_ARG="

echo Starting LessBoardGames...
call npm run dev -- %OPEN_ARG%
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo LessBoardGames failed to start.
pause
exit /b 1
