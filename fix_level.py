import codecs

p2 = r'math-pdf-to-hml-v13\gemini_client.py'
with codecs.open(p2, 'r', 'utf-8') as f:
    c2 = f.read()

old_str = '''                        level_instr = """🚨[해설 제한 — 고2 1학기: 대수 전용]
- 허용 개념: 지수와 로그, 지수함수/로그함수, 삼각함수, 사인/코사인법칙, 수열, 수학적 귀납법
- 절대 금지 개념:
   '구간' 기호 (범위는 부등식 사용), 극한, 연속
   미분, 도함수, 접선의 방정식, 적분, 극대, 극소, 이계도함수
   🚨 함수의 최대최소에 미분 절대 쓰지말고 치환, 주기성 등 대수적 방식으로만 풀 것."""'''

new_str = '''                        level_instr = """🚨[해설 제한 — 고2 1학기: 대수 (구 수학Ⅰ) 전용]
- 허용 개념: 지수와 로그, 지수함수/로그함수, 삼각함수, 사인/코사인법칙, 수열, 수학적 귀납법
- 절대 금지 개념 (이 개념을 쓴 해설이 나오면 즉시 불합격 처리됨):
   '구간' 기호 (범위는 부등식으로 표현)
   🚨 극한(\\\\lim) 기호 및 수열/함수의 '극한', '수렴', '발산', '연속' 개념 절대 금지!
   미분, 도함수, 접선, 적분, 극대, 극소, 이계도함수
   🚨 함수의 최대최소에 미분 절대 쓰지 말고 완전제곱식, 치환, 산술기하 평균, 대칭/주기성 등 순수 대수적 방식으로만 풀 것."""'''

if old_str in c2:
    c2 = c2.replace(old_str, new_str)
    with codecs.open(p2, 'w', 'utf-8') as f:
        f.write(c2)
    print("Patch applied for level_instr!")
else:
    print("Target string not found.")
