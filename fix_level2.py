import codecs
import re

p2 = r'math-pdf-to-hml-v13\gemini_client.py'
with codecs.open(p2, 'r', 'utf-8') as f:
    c2 = f.read()

pattern = r'🚨\[해설 제한 — 고2 1학기: 대수 전용\].*?대수적 방식으로만 풀 것\.'
new_str = '''🚨[해설 제한 — 고2 1학기: 대수 전용]
- 허용 개념: 지수와 로그, 지수함수/로그함수, 삼각함수, 사인/코사인법칙, 수열, 수학적 귀납법
- 절대 금지 개념 (이 개념을 쓰면 즉시 기능이 파괴됨):
   '구간' 기호 (범위는 부등식으로 표기)
   🚨 극한(\\\\lim) 기호 및 수열/함수의 '극한', '수렴', '발산', '연속' 개념 절대 사용 금지!
   미분, 도함수, 접선의 방정식, 적분, 극대, 극소, 이계도함수
   🚨 함수의 최대최소에 미분 절대 쓰지말고 이차함수, 완전제곱식, 치환, 산술기하 평균 등 대수적 방식으로만 풀 것.'''

c2_new = re.sub(pattern, new_str, c2, flags=re.DOTALL)

if c2 != c2_new:
    with codecs.open(p2, 'w', 'utf-8') as f:
        f.write(c2_new)
    print("Patch applied for level_instr!")
else:
    print("Regex target not found.")
