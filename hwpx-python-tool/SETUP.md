# Python HWPX 문제 파싱 및 재조합 도구 - 설치 및 실행 가이드

## 설치 완료 ✅

모든 핵심 모듈이 성공적으로 생성되었습니다:

- `hwpx_parser.py` - HWPX 파싱 모듈
- `hwpx_builder.py` - HWPX 재조합 모듈
- `app.py` - Flask 웹 서버
- `templates/index.html` - 프론트엔드 UI
- `static/css/style.css` - 스타일시트
- `static/js/main.js` - 클라이언트 로직

## 현재 상태

- ✅ Python 3.14.2 확인
- ✅ 가상환경 생성 완료
- ✅ Flask, Werkzeug, APScheduler 설치 완료
- ⚠️ lxml 대신 내장 xml.etree.ElementTree 사용 (Python 3.14 호환성)

## 실행 방법

### 1. 가상환경 활성화 및 서버 실행

```powershell
cd hwpx-python-tool
.\venv\Scripts\activate
python app.py
```

### 2. 브라우저 접속

```
http://localhost:5000
```

## 주의사항

1. **lxml vs ElementTree**: Python 3.14가 최신 버전이라 lxml이 아직 지원하지 않습니다. 대신 Python 내장 `xml.etree.ElementTree`를 사용하도록 수정했습니다. 기능은 동일하지만 일부 고급 기능(pretty_print 등)은 제외됩니다.

2. **실제 HWPX 파일 테스트 필요**: 코드가 작성되었지만 실제 HWPX 파일로 테스트하여 XML 구조가 올바르게 파싱되는지 확인이 필요합니다.

3. **네임스페이스 처리**: HWPX 파일의 실제 네임스페이스가 코드에 정의된 것과 다를 수 있습니다. 테스트 후 조정이 필요할 수 있습니다.

## 다음 단계

1. 서버를 실행하여 UI가 정상적으로 로드되는지 확인
2. 실제 HWPX 파일을 업로드하여 파싱 테스트
3. 오류 발생 시 디버깅 및 수정
4. 한컴오피스에서 생성된 파일 열어보기

## 예상 문제 및 해결방안

- **파싱 오류**: HWPX XML 구조가 예상과 다를 경우 → 실제 파일 구조 분석 후 코드 조정
- **네임스페이스 오류**: `findall()` 호출 시 오류 → 네임스페이스 확인 및 수정
- **문제 번호 감지 실패**: 정규식 패턴이 맞지 않는 경우 → 패턴 추가/수정
