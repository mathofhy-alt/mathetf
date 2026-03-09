import json
import re

response_text = """[
  {
    "question": "1) 두 다항식 [[EQUATION:A=2x^{2}+xy-y^{2}]], [[EQUATION:B=x^{2}-xy+2y^{2}]]에 대하여 [[EQUATION:X-A=B]]를 만족시키는 다항식 [[EQUATION:X]]는?",
    "answer_options": [
      "① [[EQUATION:x^{2}+y^{2}]]",
      "② [[EQUATION:3x^{2}-3y^{2}]]",
      "③ [[EQUATION:3x^{2}+y^{2}]]",
      "④ [[EQUATION:x^{2}+2xy-3y^{2}]]",
      "⑤ [[EQUATION:3x^{2}+2xy+y^{2}]]"
    ],
    "explanation": "[[EQUATION:X-A=B]]에서 [[EQUATION:X=A+B]]이다. 두 다항식을 더하면 [[EQUATION:X=(2x^{2}+xy-y^{2})+(x^{2}-xy+2y^{2})=3x^{2}+y^{2}]]이다."
  },
  {
    "question": "2) 이차방정식 [[EQUATION:2x^{2}+6x+3=0]]"""

def test_fix():
    fixed_text = response_text
    problems = None
    while fixed_text:
        last_brace = fixed_text.rfind('}')
        if last_brace == -1:
            break
        # 마지막 } 까지 자르기
        attempt_text = fixed_text[:last_brace+1] + '\n]'
        try:
            problems = json.loads(attempt_text)
            print(f"Success! Extracted {len(problems)} items.")
            return problems
        except Exception as e:
            # 실패하면 해당 } 는 문자열 내부의 } 이므로 그 앞부터 다시 찾음
            fixed_text = fixed_text[:last_brace]
            
    print("Failed to auto-fix.")

if __name__ == "__main__":
    test_fix()
