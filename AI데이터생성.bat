@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ============================================
echo    AI data generator (local, no time limit)
echo    unit / tags / difficulty / embedding
echo  ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js not found. Install from https://nodejs.org then retry.
    echo.
    pause
    exit /b 1
)

npx tsx scripts\generate_ai_data.ts

echo.
echo  ============================================
echo    Done. You can close this window.
echo  ============================================
pause
exit /b 0
