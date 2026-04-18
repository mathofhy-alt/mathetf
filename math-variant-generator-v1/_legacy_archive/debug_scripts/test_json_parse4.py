import json
import re

def rigorous_sanitize(text):
    print("--- Original ---")
    print(text[:200] + "...\n")
    
    # 1. 마크다운 블록 제거
    text = re.sub(r'```json\s*', '', text)
    text = re.sub(r'```\s*', '', text)
    
    # 2. JSON 배열/객체 경계 찾기
    first = text.find('[') if '[' in text else text.find('{')
    last = text.rfind(']') if ']' in text else text.rfind('}')
    if first != -1 and last != -1:
        text = text[first:last+1]
        
    # 3. [핵심] JSON의 문자열 값 내부에 있는 이스케이프되지 않은 줄바꿈(\n)을 \n 문자열로 변환
    # 파이썬 json.loads는 문자열 내부에 리터럴 줄바꿈이 있으면 에러를 냄.
    # 하지만 \n 처럼 백슬래시 n이 있는건 정상 처리함.
    # 제미나이가 가끔 생으로 엔터를 치는 경우가 있음.
    
    # 정규식으로 " " 안의 문자열을 찾아서, 그 안의 리터럴 \n을 이스케이프함
    # 단, 이미 이스케이프된 \\n 과 헷갈리지 않게 조심
    def escape_literals_in_string(match):
        s = match.group(0)
        # 문자열 내부의 실제 줄바꿈 문자를 \\n으로 변경
        s = s.replace('\n', '\\n').replace('\r', '')
        # 만약 제미나이가 탭을 썼다면 그것도 이스케이프
        s = s.replace('\t', '\\t')
        return s

    # 매칭: " 로 시작하고, " 로 끝나되, 앞선 문자가 \가 아닌 것
    # (?<!\\)" 로스 바운더리를 잡음
    text = re.sub(r'"([^"\\]*(?:\\.[^"\\]*)*)"', escape_literals_in_string, text)
    
    return text

# 테스트 1: 생 줄바꿈
bad_json_1 = """[
  {
    "question": "안녕하세요.
반갑습니다.",
    "option": "하하"
  }
]"""

# 테스트 2: 따옴표 안의 따옴표 (이스케이프 안됨)
bad_json_2 = """[
  {
    "question": "그가 "안녕"이라고 말했다"
  }
]"""

print("--- Test 1 ---")
clean1 = rigorous_sanitize(bad_json_1)
print(clean1)
try:
    print(json.loads(clean1))
    print("Test 1 Success")
except Exception as e:
    print("Test 1 Failed:", e)

print("\n--- Test 2 (Quotes) ---")
# Quotes are much harder to fix with regex without context. 
# Usually strict=False helps with control chars, but not unescaped quotes.
import ast
try:
    # Sometimes evaluating as python literal works if json fails
    # But json uses null, etc.
    pass
except:
    pass
