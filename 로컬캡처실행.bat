@echo off
chcp 65001 >nul
title 수학ETF 로컬 캡처 헬퍼 실행기
echo ==============================================
echo   수학ETF 로컬 캡처 헬퍼를 준비 중입니다...
echo   (최초 실행 시 1~2분 정도 소요될 수 있습니다)
echo ==============================================

:: 해당 배포판의 hwpx-python-tool 폴더로 이동
cd /d "%~dp0hwpx-python-tool"

echo 1. 필수 라이브러리 체크 및 자동 설치...
echo (C++ 빌드 도구가 없는 환경을 위해 바이너리 버전만 설치를 시도합니다)
python -m pip install --upgrade pip
python -m pip install opencv-python numpy Pillow pywin32 --only-binary :all:
python -m pip install supabase --only-binary :all:

:: 만약 supabase 설치 실패 시 코어 라이브러리만이라도 개별 설치 시도
if %ERRORLEVEL% NEQ 0 (
    echo [주의] 통합 패키지 설치 실패. 개별 패키지 설치로 전환합니다...
    python -m pip install httpx postgrest storage3 gotrue --only-binary :all:
)

echo.
echo 2. 프로그램 실행 준비 완료!
echo.
python local_sync_capturer.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ----------------------------------------------
    echo [에러] 프로그램 실행에 실패했습니다.
    echo 파이썬(Python)이 설치되어 있지 않거나 경로가 잘못되었습니다.
    echo ----------------------------------------------
    pause
)
