import os

file_path = "gemini_client.py"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# 1. 6번 위치에 환각 경고 삽입 & 기존 6번을 7번으로 밀어내기
old_6 = "6. **[초엄격: LaTeX 절대 금지, 오직 HWP(한글) 수식 문법 사용]**"
new_6_7 = """6. 🚨 **[초엄격: 수식 대칭성/관습에 의한 시각적 환각(Hallucination) 경고]** 아주 빈번히 발생하는 치명적 오류입니다! 수식의 패턴이나 구조적 대칭성(예: 분자가 `켤레복소수(bar)`니까 당연히 분모도 `켤레복소수`일 것이라는 수학자적 추기)에 무의식적으로 이끌려 **원본 이미지에 존재하지 않는 기호(`bar` 가로줄, `-` 마이너스 등)를 눈에 헛것이 보여 멋대로 창조해서 붙이지 마세요!!** 제발 수학적 직관을 끄고 픽셀 단위로 '가로줄'이 진짜 있는지 없는지만 현미경처럼 관측하세요.
7. **[초엄격: LaTeX 절대 금지, 오직 HWP(한글) 수식 문법 사용]**"""

if old_6 in text:
    text = text.replace(old_6, new_6_7)
    print("Rule 6 injected successfully.")

# 2. 기존 번호들 +1씩 밀기
replacements = [
    ("7. **크기 조절 괄호 필수**", "8. **크기 조절 괄호 필수**"),
    ("8. **극한(Limit) 문제 시각적 풀이 필수**", "9. **극한(Limit) 문제 시각적 풀이 필수**"),
    ("9. **[최종 자체 검수 필수]**", "10. **[최종 자체 검수 필수]**"),
    ("10. 해설은 해라체(-다)", "11. 해설은 해라체(-다)"),
    ("11. **[본문 텍스트 일치 여부 재검증]**", "12. **[본문 텍스트 일치 여부 재검증]**"),
    ("12. **[계산 결과 불일치 시 원본 재확인 절대 원칙]**", "13. **[계산 결과 불일치 시 원본 재확인 절대 원칙]**"),
    ("13. **[단어 누락 / <보기> 공백 절대 금지]**", "14. **[단어 누락 / <보기> 공백 절대 금지]**")
]

for old_val, new_val in replacements:
    if old_val in text:
        text = text.replace(old_val, new_val)
        print(f"Updated: {old_val[:15]} -> {new_val[:15]}")
    else:
        print(f"Warning: {old_val} not found in text.")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)
print("gemini_client.py patch completed.")
