@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo.
echo  ============================================
echo    시험지 미리보기 생성
echo    (새로 올린 PDF만 자동 처리, 기존 건 건너뜀)
echo  ============================================
echo.

if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" "scripts\generate_previews.py"
) else (
    python "scripts\generate_previews.py"
)

echo.
echo  ============================================
echo    완료! 이 창은 닫으셔도 됩니다.
echo  ============================================
pause
