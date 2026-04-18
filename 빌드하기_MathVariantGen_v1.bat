@echo off
chcp 65001 > nul
cd /d "c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-variant-generator-v1"
call .\.venv\Scripts\activate.bat
pyinstaller --clean MathVariantGen_v1.spec
echo.
echo ========================================
echo 컴파일 완료! dist 폴더를 확인해주세요.
echo ========================================
pause
