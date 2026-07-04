@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

echo.
echo  ============================================
echo    Preview + Free-PDF generator
echo    (only new uploads; existing ones skipped)
echo  ============================================
echo.

call :findpy
if "%PYEXE%"=="" (
    echo  [ERROR] No working Python found ^(needs fitz/PIL/requests^).
    echo          Install then retry:  python -m pip install pymupdf pillow requests
    echo.
    pause
    exit /b 1
)
echo  Using Python: %PYEXE%
echo.

echo  [1/4] Generating preview images...
%PYEXE% "scripts\generate_previews.py"
echo.
echo  [2/4] Generating free-problem PDFs...
%PYEXE% "scripts\generate_free_pdfs.py"
echo.
echo  [3/4] Generating mock-exam previews...
%PYEXE% "scripts\generate_mock_previews.py"
echo.
echo  [4/4] Generating exam SEO analysis (gemini-3.5-flash)...
%PYEXE% "scripts\generate_exam_analysis.py"

echo.
echo  ============================================
echo    Done. You can close this window.
echo  ============================================
pause
exit /b 0

:findpy
setlocal enabledelayedexpansion
set "FOUND="
for %%C in ("python" "py -3" ".venv\Scripts\python.exe") do (
    if "!FOUND!"=="" (
        %%~C -c "import fitz, PIL, requests" >nul 2>&1 && set "FOUND=%%~C"
    )
)
endlocal & set "PYEXE=%FOUND%"
goto :eof
