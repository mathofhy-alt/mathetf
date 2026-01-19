# HWPX 문제 파싱 및 재조합 도구

Python Flask 기반의 독립적인 웹 애플리케이션으로 HWPX 파일에서 수학 문제를 추출하고 재조합합니다.

## 주요 기능

- ✅ HWPX 파일 업로드 (드래그 앤 드롭 지원)
- ✅ 자동 문제 파싱 (정규식 패턴: `1.`, `(1)`, `[1]`)
- ✅ 문제 선택 UI (체크박스, 전체선택/해제)
- ✅ 문제 미리보기 (첫 100자)
- ✅ 선택된 문제로 새 HWPX 파일 생성
- ✅ 문제 번호 자동 재정렬

## 설치 방법

### 1. Python 가상환경 생성

```bash
cd hwpx-python-tool
python -m venv venv
```

### 2. 가상환경 활성화

**Windows:**
```bash
venv\Scripts\activate
```

**macOS/Linux:**
```bash
source venv/bin/activate
```

### 3. 의존성 설치

```bash
pip install -r requirements.txt
```

## 실행 방법

```bash
python app.py
```

서버가 시작되면 브라우저에서 `http://localhost:5000` 접속

## 사용 방법

1. **HWPX 파일 업로드**: 드래그 앤 드롭 또는 파일 선택 버튼 클릭
2. **문제 선택**: 체크박스로 원하는 문제 선택
3. **파일 생성**: "선택한 문제로 HWPX 파일 생성" 버튼 클릭
4. **다운로드**: 자동으로 다운로드 시작

## 프로젝트 구조

```
hwpx-python-tool/
├── app.py                      # Flask 메인 애플리케이션
├── hwpx_parser.py             # HWPX 파싱 모듈
├── hwpx_builder.py            # HWPX 재조합 모듈
├── requirements.txt           # Python 의존성
├── templates/
│   └── index.html             # 메인 UI
├── static/
│   ├── css/
│   │   └── style.css          # 스타일시트
│   └── js/
│       └── main.js            # 클라이언트 로직
├── uploads/                    # 업로드 임시 폴더
├── output/                     # 생성 파일 폴더
└── extracts/                   # 압축 해제 폴더
```

## 기술 스택

- **Backend**: Flask 3.0.0
- **XML Processing**: lxml 5.1.0
- **Task Scheduling**: APScheduler 3.10.4
- **Frontend**: Vanilla HTML/CSS/JavaScript

## 주요 기능 설명

### HWPX 파싱 (`hwpx_parser.py`)

- ZIP 압축 해제
- `Contents/section*.xml` 파일 파싱
- 네임스페이스 인식 XML 처리
- 정규식 기반 문제 번호 감지
- 텍스트 및 이미지 참조 추출

### HWPX 재조합 (`hwpx_builder.py`)

- 원본 HWPX 구조 복사
- 선택된 문제만 추출
- 문제 번호 재정렬 (1, 2, 3...)
- 미사용 이미지 제거
- ZIP 재압축

### 자동 임시 파일 정리

- 24시간 이상 된 파일 자동 삭제
- 6시간마다 실행

## 제한사항 (MVP)

- ✅ 텍스트 기반 문제 파싱
- ⏳ 이미지 포함 처리 (2단계 기능)
- ⏳ 복잡한 서식 보존 (표, 수식)
- ⏳ HWP 파일 지원

## 라이선스

MIT License

## 버전

v1.0.0 - Initial Release
