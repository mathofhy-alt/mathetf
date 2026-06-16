@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo.
echo  ============================================
echo    시험지 미리보기 + 무료 문제PDF 생성
echo    (새로 올린 PDF만 자동 처리, 기존 건 건너뜀)
echo  ============================================
echo.

if exist ".venv\Scripts\python.exe" (
    echo  [1/2] 문제 미리보기 이미지 생성...
    ".venv\Scripts\python.exe" "scripts\generate_previews.py"
    echo.
    echo  [2/2] 무료 문제PDF 생성...
    ".venv\Scripts\python.exe" "scripts\generate_free_pdfs.py"
) else (
    echo  [1/2] 문제 미리보기 이미지 생성...
    python "scripts\generate_previews.py"
    echo.
    echo  [2/2] 무료 문제PDF 생성...
    python "scripts\generate_free_pdfs.py"
)

echo.
echo  ============================================
echo    완료! 이 창은 닫으셔도 됩니다.
echo  ============================================
pause
