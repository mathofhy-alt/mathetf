import json
import re

raw_text = r"""```json
[
  {
    "question_num": "11",
    "question": "수직선 위를 움직이는 점 [[EQUATION:P]]의 시각 [[EQUATION:t(t >= 0)]]에서의 속도 [[EQUATION:v(t)]]가 다음과 같다.\n[[EQUATION:v(t) = 3t^{2} - 10t + 7]]\n시각 [[EQUATION:t=0]]에서의 점 [[EQUATION:P]]의 위치가 [[EQUATION:3]]일 때, <보기>에서 옳은 것만을 있는 대로 고른 것은?\n<보기>\nㄱ. 시각 [[EQUATION:t=2]]에서의 점 [[EQUATION:P]]의 속도는 [[EQUATION:-1]]이다.\nㄴ. 시각 [[EQUATION:t=1]]에서의 점 [[EQUATION:P]]의 위치는 [[EQUATION:3]]이다.\nㄷ. 시각 [[EQUATION:t=0]]에서 [[EQUATION:t=2]]까지 점 [[EQUATION:P]]가 움직인 거리는 [[EQUATION:4]]이다.",
    "answer_options": ["① ㄱ", "② ㄴ", "③ ㄱ, ㄷ", "④ ㄴ, ㄷ", "⑤ ㄱ, ㄴ, ㄷ"],
    "thought_process": "점 [[EQUATION:P]]의 속도 [[EQUATION:v(t)]]에 대하여\n점 [[EQUATION:P]]의 가속도 [[EQUATION:a(t) = v'(t) = 6t - 10]]\n점 [[EQUATION:P]]의 위치 [[EQUATION:x(t) = int v(t) dt = t^{3} - 5t^{2} + 7t + C]]\n이때 시각 [[EQUATION:t=0]]에서의 점 [[EQUATION:P]]의 위치가 [[EQUATION:3]]이므로 [[EQUATION:C=3]]이다.\n[[EQUATION:x(t) = t^{3} - 5t^{2} + 7t + 3]]",
    "explanation": "ㄱ. 점 [[EQUATION:P]]의 속도 [[EQUATION:v(t)]]에 대하여\n[[EQUATION:v(2) = 3 times 2^{2} - 10 times 2 + 7 = 12 - 20 + 7 = -1]]이다. (참)\n\nㄴ. 시각 [[EQUATION:t=0]]에서의 점 [[EQUATION:P]]의 위치가 [[EQUATION:3]]이었으므로, 시각 [[EQUATION:t=1]]일 때 점 [[EQUATION:P]]의 위치 [[EQUATION:x(1)]]은 다음과 같다.\n[[EQUATION:x(1) = 3 + int _{0}^{1} v(t) dt = 3 + int _{0}^{1} (3t^{2} - 10t + 7) dt = 3 + LEFT [ t^{3} - 5t^{2} + 7t RIGHT ] _{0}^{1} = 3 + 1 - 5 + 7 = 6]]이므로 거짓이다. (거짓)\n\nㄷ. 시각 [[EQUATION:t=0]]에서 [[EQUATION:t=2]]까지 점 [[EQUATION:P]]가 움직인 거리 [[EQUATION:s]]는 다음과 같다.\n[[EQUATION:v(t) = 3t^{2} - 10t + 7 = (3t-7)(t-1)]]이므로\n[[EQUATION:s = int _{0}^{2} |v(t)| dt = int _{0}^{1} v(t) dt + int _{1}^{2} { - v(t) } dt]]\n[[EQUATION:int _{0}^{1} v(t) dt = LEFT [ t^{3} - 5t^{2} + 7t RIGHT ] _{0}^{1} = 1 - 5 + 7 = 3]]이고,\n[[EQUATION:int _{1}^{2} { - v(t) } dt = - LEFT [ t^{3} - 5t^{2} + 7t RIGHT ] _{1}^{2} = - LEFT { (8 - 20 + 14) - (1 - 5 + 7) RIGHT } = - (2 - 3) = 1]]\n이므로 [[EQUATION:s = 3 + 1 = 4]]이다. (참)\n\n따라서 옳은 것은 ㄱ, ㄷ이다.\n따라서 정답은 ③이다."
  }
]
```"""

def _sanitize_json(text):
    first = text.find('[') if '[' in text else text.find('{')
    last = text.rfind(']') if ']' in text else text.rfind('}')
    if first != -1 and last != -1:
        text = text[first:last+1]
    
    # Python json.loads needs actual literal backslashes to be double-escaped if they represent a backslash in the string,
    # or just normal parsing if it's \n. 
    # Let's see what breaks.
    return text

cleaned = _sanitize_json(raw_text)
print("CLEANED TEXT")
print(cleaned)

# The most common issue with strict JSON is newlines or unescaped quotes within the string.
# Since Gemini sends \n as a literal backslash followed by n (r"\n"), this should be valid JSON string syntax.
try:
    obj = json.loads(cleaned)
    print("SUCCESS")
except Exception as e:
    import traceback
    print("PARSE ERROR:", e)
    
    # Let's see if strict=False helps
    try:
        obj = json.loads(cleaned, strict=False)
        print("SUCCESS WITH STRICT=FALSE")
    except Exception as e2:
        print("STILL ERROR:", e2)

