import json
import re

text = r"""[
  {
    "question": "[[EQUATION:8]] 백이진과 나희도가 [[EQUATION:x]] 에 대한 이차방정식 [[EQUATION:x^{2} + ax + b = 0]] ([[EQUATION:a, b]] 는 실수)의 근을 구하려고 한다. 그런데 백이진은 [[EQUATION:x]] 의 계수를 [[EQUATION:a]] 가 아닌 다른 실수의 값으로 보고 풀어 두 근 [[EQUATION:4, -2]] 를 얻었고, 나희도는 상수항을 [[EQUATION:b]] 가 아닌 다른 실수의 값으로 보고 풀어 두 근 [[EQUATION:1+2i, 1-2i]] 를 얻었다. 이때, [[EQUATION:a+b+\alpha+\beta]] 의 값은? (단, [[EQUATION:i = sqrt{-1}]] 이며, [[EQUATION:\alpha, \beta]] 는 주어진 방정식의 두 근이다.)",
    "answer_options": [
      "① [[EQUATION:9]]"
    ],
    "explanation": "백이진은 [[EQUATION:x]] 의 계수 [[EQUATION:a]] 는 잘못 보았으나 상수항 [[EQUATION:b]] 는 제대로 보았다.\n두 근의 곱 [[EQUATION:b = 4 \times (-2) = -8]] 이다.\n나희도는 상수항 [[EQUATION:b]] 는 잘못 보았으나 [[EQUATION:x]] 의 계수 [[EQUATION:a]] 는 제대로 보았다.\n두 근의 합 [[EQUATION:-a = (1+2i) + (1-2i) = 2]] 에서 [[EQUATION:a = -2]] 이다.\n따라서 주어진 이차방정식은 [[EQUATION:x^{2} - 2x - 8 = 0]] 이고, 이 방정식의 두 근 [[EQUATION:\alpha, \beta]] 의 합은 [[EQUATION:\alpha + \beta = 2]] 이다.\n[[EQUATION:a + b + \alpha + \beta = -2 + (-8) + 2 = -8]] 이다.\n(참고: 문제의 선택지에 해당 결과값이 없으나, 계산 결과는 [[EQUATION:-8]] 입니다.)"
  }
]"""

fixed = re.sub(r'\\(?=[^"\\/nrtu])', r'\\\\', text)

try:
    res = json.loads(fixed)
    print('Fixed loaded fine!')
    print(res[0]['question'][-100:])
    print(res[0]['explanation'][200:300])
except Exception as e:
    print('Fixed failed:', e)
