import json
import re

text = r"""[
  {
    "question": "[[EQUATION:8]] 백이진과 나희도가 [[EQUATION:x]]에 대한 이차방정식 [[EQUATION:x^{2} +ax+b=0]] ([[EQUATION:a, b]]는 실수)의 근을 구하려고 한다. 그런데 백이진은 [[EQUATION:x]]의 계수를 [[EQUATION:a]]가 아닌 다른 실수의 값으로 보고 풀어 두 근 [[EQUATION:4, -2]]를 얻었고, 나희도는 상수항을 [[EQUATION:b]]가 아닌 다른 실수의 값으로 보고 풀어 두 근 [[EQUATION:1+2i, 1-2i]]를 얻었다. 이때, [[EQUATION:a+b+\\alpha +\\\beta]]의 값은? (단, [[EQUATION:i = sqrt{-1}]]이며, [[EQUATION:\\\alpha, \\\beta]]는 주어진 방정식의 두 근이다.)",
    "answer_options": [],
    "explanation": "백이진은 계수 [[EQUATION:a]]를 잘못 보았으나 상수항 [[EQUATION:b]]는 제대로 보았다. 두 근의 곱이 [[EQUATION:4 \times (-2) = -8]]이므로 [[EQUATION:b = -8]]이다.\n나희도는 상수항 [[EQUATION:b]]를 잘못 보았으나 계수 [[EQUATION:a]]는 제대로 보았다. 두 근의 합이 [[EQUATION:(1+2i) + (1-2i) = 2]]이므로 [[EQUATION:-a = 2]], 즉 [[EQUATION:a = -2]]이다.\n따라서 원래의 이차방정식은 [[EQUATION:x^{2} -2x-8 = 0]]이며, 이 방정식의 두 근 [[EQUATION:\\alpha, \\\beta]]의 합 [[EQUATION:\\alpha + \\beta = 2]]이다.\n구하고자 값 [[EQUATION:a+b+\\alpha+\\\beta = -2 + (-8) + 2 = -8]]이다."
  }
]"""

# 1. 먼저 이미 두 개인 것들을 하나로 뺌 (정규화)
# 2. 그 다음 유효하지 않은 이스케이프 앞에 하나를 붙임

# 복잡한 백슬래시를 일단 단일 백슬래시로 모두 정규화 (하지만 제어문자 \n 등은 보호)
# 근데 그건 JSON 파싱 로직 자체를 해칠 수 있음.
# 가장 단순한 방법:
# 파이썬 json.loads는 내부에 invalid escape가 있으면 죽음.
# 그 문자를 무조건 이중 이스케이프로 바꿔주기 (역슬래시 자체도 이스케이프 대상 제외하고, 제어문자 제외하고, 전부 치환)

def fix_json_escapes(s):
    # JSON 파싱 과정에서 \x 나 \u 가 아닌 알 수 없는 \a \b \c 등이 들어오면 에러.
    # 따라서 모든 \ 를 일단 캡쳐하고 그 뒤가 " \ / b f n r t u 인지 검사.
    # 하지만 이미 \\ 형태로 이스케이프 된 애들은 넘어가는게 중요.
    
    # 정규식 분석:
    # 1. (?<!\\) : 앞선 문자가 \ 가 아닐 것
    # 2. \\ : 역슬래시 한 개
    # 3. (?![\\"/bfnrtu]) : 뒤에 따라오는 문자가 저 중 하나가 아닐 것
    
    # 하지만 \\alpha 는 \가 2개고 a가 온다. 
    # AI가 \\\alpha 라고 보내면 \가 3개다.
    
    # 가장 무식하고 확실한 방법은, 백슬래시를 다루는 전문 라이브러리를 쓰거나
    # 아니면 일단 다 문자로 치환했다가 다시 복구하는 것.
    
    # 이렇게 하자: 백슬래시 여러 개를 전부 1개로 통일한 뒤, 우리가 원하는 곳에만 2개를 넣는다.
    # s = re.sub(r'\\+', r'\\', s) # 근데 이러면 \n이 \\n이 되나? 아님. raw string이라 그냥 \n임.
    # 안된다. \n이 날아감.
    pass

# 가장 좋은 방법:
# 1단계: 역슬래시 단일/복수를 묶어서 모두 \\ 로 치환 후, 제어 문자는 돌려놓기.
def sanitize_json(text):
    # 백슬래시가 1개 이상 연속된 부분을 모두 하나로 만든다.
    text = re.sub(r'\\+', r'\\', text)
    # 그런 다음 유효한 이스케이프 문자열이 아닌 경우, 무조건 2개로 바꾼다.
    text = re.sub(r'\\([^"\\/bfnrtu])', r'\\\\\1', text)
    return text

fixed = sanitize_json(text)
print("FIXED:", fixed[-100:])

try:
    res = json.loads(fixed)
    print('새 정규식 성공!')
except Exception as e:
    print('새 정규식 실패:', e)
