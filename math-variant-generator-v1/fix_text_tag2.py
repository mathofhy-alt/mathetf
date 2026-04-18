import json
import os

# 1. Update dictionary mapping
with open('gemini_hwp_dict.json', 'r', encoding='utf-8') as f:
    d = json.load(f)

d["\\text"] = "rm"
d["\\mathrm"] = "rm"
d["\\mathbf"] = "bold"
d["\\mathit"] = "it"

with open('gemini_hwp_dict.json', 'w', encoding='utf-8') as f:
    json.dump(d, f, indent=2, ensure_ascii=False)

# 2. Update gemini_client.py to protect \text
with open('gemini_client.py', 'r', encoding='utf-8') as f:
    text = f.read()

# find latex_cmds = [...]
target = "'mathbf', 'mathrm', 'mathbb', 'mathcal'"
replacement = "'mathbf', 'mathrm', 'mathbb', 'mathcal', 'mathit', 'text'"

text = text.replace(target, replacement)

# 3. Add prompt explicitly prohibiting \text for variables
prompt_target = r"분수(\frac)처럼 위아래로 큰 수식을 괄호로 묶을 때는 일반 ( ) 를 절대 쓰지 마세요. 무조건 크기가 자동 조절되는 \left( \frac{A}{B} \right) 등 \left 와 \right 를 쌍으로 작성하세요."
prompt_replacement = "분수(\\frac)처럼 위아래로 큰 수식을 괄호로 묶을 때는 일반 ( ) 를 절대 쓰지 마세요. 무조건 크기가 자동 조절되는 \\left( \\frac{A}{B} \\right) 등 \\left 와 \\right 를 쌍으로 작성하세요.\n    - 🚨 [초엄격: \\text 사용 규칙]: 선분 AB 등 단순 수학 변수 기호를 쓸 때 절대 `\\text{AB}` 처럼 텍스트 모드로 감싸지 마세요! 무조건 순수 변수 `AB` 로만 출력하세요. 단, 한글 텍스트(예: `\\text{최댓값}`)가 수식에 들어갈 때만 예외적으로 `\\text{}`를 허용합니다."

text = text.replace(prompt_target, prompt_replacement)

with open('gemini_client.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Text tag protection and mapping applied.")
