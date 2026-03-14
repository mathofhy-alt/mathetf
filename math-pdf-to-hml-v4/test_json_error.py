import json
import re

raw_response = r"""[
  {
    "question": "[[EQUATION:1]] 두 다항식 [[EQUATION:A = 2x^{2} + xy - y^{2}]], [[EQUATION:B = x^{2} - xy + 2y^{2}]] 에 대하여 [[EQUATION:X - A = B]]를 만족시키는 다항식 [[EQUATION:X]]는?",
    "answer_options": [
      "① [[EQUATION:x^{2} + y^{2}]]",
      "② [[EQUATION:3x^{2} - 3y^{2}]]",
      "③ [[EQUATION:3x^{2} + y^{2}]]",
      "④ [[EQUATION:x^{2} + 2xy - 3y^{2}]]",
      "⑤ [[EQUATION:3x^{2} + 2xy + y^{2}]]"
    ],
    "explanation": "[[EQUATION:X - A = B]]에서 [[EQUATION:X = A + B]]입니다.\n[[EQUATION:X = (2x^{2} + xy - y^{2}) + (x^{2} - xy + 2y^{2}) = 3x^{2} + y^{2}]]\n따라서 정답은 ③입니다."
  },
  {
    "question": "[[EQUATION:2]] 이차방정식 [[EQUATION:2x^{2} + 6x + 3 = 0]]에 대한 설명으로 옳은 것은?",
    "answer_options": [
      "① 중근을 갖는다.",
      "② 근이 존재하지 않는다.",
      "③ 서로 다른 두 실근을 갖는다.",
      "④ 서로 다른 두 허근을 갖는다.",
      "⑤ 하나의 허근과 하나의 실근을 갖는다."
    ],
    "explanation": "이차방정식 [[EQUATION:2x^{2} + 6x + 3 = 0]]의 판별식을 [[EQUATION:D]]라 하면,\n[[EQUATION:{D} over {4} = 3^{2} - 2 \\times 3 = 9 - 6 = 3 > 0]]\n판별식이 [[EQUATION:0]]보다 크므로 서로 다른 두 실근을 갖습니다.\n따라서 정답은 ③입니다."
  },
  {
    "question": "[[EQUATION:3]] 직선 [[EQUATION:y = x + k]]가 이차함수 [[EQUATION:y = x^{2} - 2x + 2]]의 그래프와 만나지 않을 때, 실수 [[EQUATION:k]]값의 범위는?",
    "answer_options": [
      "① [[EQUATION:k > - {1} over {2}]]",
      "② [[EQUATION:k < - {1} over {2}]]",
      "③ [[EQUATION:k <= - {1} over {4}]]",
      "④ [[EQUATION:k < - {1} over {4}]]",
      "⑤ [[EQUATION:k > - {1} over {4}]]"
    ],
    "explanation": "이차함수와 직선의 방정식을 연립하면 [[EQUATION:x^{2} - 2x + 2 = x + k]]\n[[EQUATION:x^{2} - 3x + 2 - k = 0]]\n그래프가 만나지 않으려면 판별식 [[EQUATION:D < 0]]이어야 합니다.\n[[EQUATION:D = (-3)^{2} - 4(2 - k) = 9 - 8 + 4k = 1 + 4k < 0]]\n[[EQUATION:4k < -1]] 이므로 [[EQUATION:k < - {1} over {4}]]\n따라서 정답은 ④입니다."
  },
  {
    "question": "[[EQUATION:4]] [[EQUATION:x + y = sqrt{3}]], [[EQUATION:xy = -3]]일 때, [[EQUATION:{x^{2}} over {y} - {y^{2}} over {x}]] 의 값은? (단, [[EQUATION:x > y]])",
    "answer_options": [
      "① [[EQUATION:-8sqrt{15}]]",
      "② [[EQUATION:-2sqrt{15}]]",
      "③ [[EQUATION:2sqrt{15}]]",
      "④ [[EQUATION:8sqrt{15}]]",
      "⑤ [[EQUATION:14sqrt{15}]]"
    ],
    "explanation": "[[EQUATION:{x^{2}} over {y} - {y^{2}} over {x} = {x^{3} - y^{3}} over {xy} = {(x - y)(x^{2} + xy + y^{2})} over {xy}]]\n[[EQUATION:(x - y)^{2} = (x + y)^{2} - 4xy = (sqrt{3})^{2} - 4(-3) = 3 + 12 = 15]]\n[[EQUATION:x > y]]이므로 [[EQUATION:x - y = sqrt{15}]]\n[[EQUATION:x^{2} + y^{2} = (x + y)^{2} - 2xy = 3 - 2(-3) = 9]]\n따라서 [[EQUATION:{sqrt{15}(9 - 3)} over {-3} = {6sqrt{15}} over {-3} = -2sqrt{15}]]\n따라서 정답은 ②입니다."
  },
  {
    "question": "[[EQUATION:5]] 이차함수 [[EQUATION:y = f(x)]]의 그래프가 [[EQUATION:x]]축과 서로 다른 두 점 [[EQUATION:(\\alpha, 0)]], [[EQUATION:(\\beta, 0)]]에서 만나고 [[EQUATION:\\alpha + \\beta = 10]]일 때, 방정식 [[EQUATION:f(2x - 5) = 0]]의 모든 실근의 합은?",
    "answer_options": [
      "① [[EQUATION:10]]",
      "② [[EQUATION:15]]",
      "③ [[EQUATION:20]]",
      "④ [[EQUATION:25]]",
      "⑤ [[EQUATION:30]]"
    ],
    "explanation": "[[EQUATION:f(x) = 0]]의 두 근이 [[EQUATION:\\alpha, \\beta]]이므로 [[EQUATION:f(2x - 5) = 0]]을 만족하는 [[EQUATION:x]]는\n[[EQUATION:2x - 5 = \\alpha]] 또는 [[EQUATION:2x - 5 = \\beta]]입니다.\n[[EQUATION:x_{1} = {\\alpha + 5} over {2}]], [[EQUATION:x_{2} = {\\beta + 5} over {2}]]\n두 실근의 합은 [[EQUATION:x_{1} + x_{2} = {\\alpha + \\beta + 10} over {2} = {10 + 10} over {2} = 10]]\n따라서 정답은 ①입니다."
  },
  {
    "question": "[[EQUATION:6]] 최고차항의 계수가 [[EQUATION:1]]인 삼차다항식 [[EQUATION:f(x)]]와 최고차항의 계수가 [[EQUATION:2]]인 이차다항식 [[EQUATION:g(x)]]가 다음 조건을 만족시킨다.\n(가) 모든 실수 [[EQUATION:x]]에 대하여 [[EQUATION:f(-x) + f(x) = 0]]이다.\n(나) 모든 실수 [[EQUATION:x]]에 대하여 [[EQUATION:g(-x) = g(x)]]이다.\n(다) 다항식 [[EQUATION:f(x) + g(x)]]는 [[EQUATION:x - 1]]로 나누어떨어진다.\n[[EQUATION:f(2) + 2g(2)]]의 값은?",
    "answer_options": [
      "① [[EQUATION:15]]",
      "② [[EQUATION:16]]",
      "③ [[EQUATION:17]]",
      "④ [[EQUATION:18]]",
      "⑤ [[EQUATION:19]]"
    ],
    "explanation": "조건 (가)에서 [[EQUATION:f(x)]]는 기함수이므로 [[EQUATION:f(x) = x^{3} + ax]]\n조건 (나)에서 [[EQUATION:g(x)]]는 우함수이므로 [[EQUATION:g(x) = 2x^{2} + b]]\n조건 (다)에서 [[EQUATION:f(1) + g(1) = 0]]이므로 [[EQUATION:(1 + a) + (2 + b) = 0 \\Rightarrow a + b = -3]]\n구하는 값은 [[EQUATION:f(2) + 2g(2) = (2^{3} + 2a) + 2(2 \\times 2^{2} + b) = 8 + 2a + 16 + 2b = 24 + 2(a + b) = 24 + 2(-3) = 18]]\n따라서 정답은 ④입니다."
  },
  {
    "question": "[[EQUATION:7]] 임의의 [[EQUATION:x]]에 대하여 등식\n[[EQUATION:6x^{3} - x^{2} + d = a(x - 1)^{3} + b(x - 1)^{2} + c(x - 1) + 9]]\n가 항상 성립할 때, 상수 [[EQUATION:a, b, c, d]]에 대하여 [[EQUATION:a + b + c + d]]의 값은?",
    "answer_options": [
      "① [[EQUATION:41]]",
      "② [[EQUATION:43]]",
      "③ [[EQUATION:45]]",
      "④ [[EQUATION:47]]",
      "⑤ [[EQUATION:49]]"
    ],
    "explanation": "최고차항의 계수를 비교하면 [[EQUATION:a = 6]]입니다.\n[[EQUATION:6x^{3} - x^{2} + d]]를 [[EQUATION:x - 1]]에 대한 내림차순으로 정리하기 위해 조립제법을 반복 사용합니다.\n[[EQUATION:6x^{3} - x^{2} + 0x + d]]\n[[EQUATION:1]] | [[EQUATION:6]] [[EQUATION:-1]] [[EQUATION:0]] [[EQUATION:d]]\n  |   [[EQUATION:6]] [[EQUATION:5]] [[EQUATION:5]]\n  ------------------\n  [[EQUATION:6]] [[EQUATION:5]] [[EQUATION:5]] | [[EQUATION:d + 5 = 9 \\Rightarrow d = 4]]\n[[EQUATION:1]] | [[EQUATION:6]] [[EQUATION:5]] [[EQUATION:5]]\n  |   [[EQUATION:6]] [[EQUATION:11]]\n  ------------------\n  [[EQUATION:6]] [[EQUATION:11]] | [[EQUATION:16 = c]]\n[[EQUATION:1]] | [[EQUATION:6]] [[EQUATION:11]]\n  |   [[EQUATION:6]]\n  ------------------\n  [[EQUATION:6]] | [[EQUATION:17 = b]]\n따라서 [[EQUATION:a = 6, b = 17, c = 16, d = 4]] 이므로 [[EQUATION:a + b + c + d = 6 + 17 + 16 + 4 = 43]]\n따라서 정답은 ②입니다."
  },
  {
    "question": "[[EQUATION:8]] 사차다항식 [[EQUATION:f(x)]]를 [[EQUATION:x - 3]]으로 나누었을 때의 몫을 [[EQUATION:Q(x)]], 나머지를 [[EQUATION:R]]이라 하고, 다항식 [[EQUATION:f(x)]]를 [[EQUATION:2Q(x) + 4]]로 나누었을 때의 몫과 나머지의 합을 [[EQUATION:g(x)]]라 할 때, 다항식 [[EQUATION:g(x) - R]]를 [[EQUATION:x - 9]]로 나누었을 때의 나머지는?",
    "answer_options": [
      "① [[EQUATION:-9]]",
      "② [[EQUATION:-7]]",
      "③ [[EQUATION:-5]]",
      "④ [[EQUATION:-3]]",
      "⑤ [[EQUATION:-1]]"
    ],
    "explanation": "[[EQUATION:f(x) = (x - 3)Q(x) + R = {1} over {2}(x - 3) \\times 2Q(x) + R]]\n[[EQUATION:f(x) = {1} over {2}(x - 3)(2Q(x) + 4 - 4) + R = {1} over {2}(x - 3)(2Q(x) + 4) - 2(x - 3) + R]]\n[[EQUATION:f(x) = {1} over {2}(x - 3)(2Q(x) + 4) + (-2x + 6 + R)]]\n나누는 식 [[EQUATION:2Q(x) + 4]]의 차수가 [[EQUATION:Q(x)]]와 같으므로 나머지는 [[EQUATION:-2x + 6 + R]]입니다.\n몫은 [[EQUATION:{1} over {2}(x - 3)]]이므로 [[EQUATION:g(x) = {1} over {2}(x - 3) - 2x + 6 + R = - {3} over {2}x + {9} over {2} + R]]\n[[EQUATION:g(x) - R = - {3} over {2}x + {9} over {2}]]\n[[EQUATION:x - 9]]로 나눈 나머지는 [[EQUATION:g(9) - R = - {3} over {2}(9) + {9} over {2} = - {27} over {2} + {9} over {2} = -9]]\n따라서 정답은 ①입니다."
  },
  {
    "question": "[[EQUATION:9]] 두 다항식 [[EQUATION:f(x), g(x)]]에 대하여 [[EQUATION:f(x) + g(x)]]를 [[EQUATION:x^{2} + x + 1]]로 나누었을 때의 나머지가 [[EQUATION:3]]이고, [[EQUATION:f(x) - g(x)]]를 [[EQUATION:x^{2} + x + 1]]로 나누었을 때의 나머지가 [[EQUATION:2]]이다. 이때, [[EQUATION:f(x) + kg(x)]]가 [[EQUATION:x^{2} + x + 1]]을 인수로 갖도록 하는 상수 [[EQUATION:k]]의 값은?",
    "answer_options": [
      "① [[EQUATION:-9]]",
      "② [[EQUATION:-7]]",
      "③ [[EQUATION:-5]]",
      "④ [[EQUATION:-3]]",
      "⑤ [[EQUATION:-1]]"
    ],
    "explanation": "[[EQUATION:f(x) + g(x) \\equiv 3 \\pmod{x^{2} + x + 1}]]\n[[EQUATION:f(x) - g(x) \\equiv 2 \\pmod{x^{2} + x + 1}]]\n두 식을 더하면 [[EQUATION:2f(x) \\equiv 5 \\Rightarrow f(x) \\equiv {5} over {2}]]\n두 식을 빼면 [[EQUATION:2g(x) \\equiv 1 \\Rightarrow g(x) \\equiv {1} over {2}]]\n[[EQUATION:f(x) + kg(x) \\equiv {5} over {2} + k \\times {1} over {2} \\equiv 0 \\pmod{x^{2} + x + 1}]]\n[[EQUATION:5 + k = 0 \\Rightarrow k = -5]]\n따라서 정답은 ③입니다."
  },
  {
    "question": "[[EQUATION:10]] 다음은 모든 실수 [[EQUATION:x]]에 대하여 [[EQUATION:f(x) = f(3n - x)]]를 만족시키는 이차함수 [[EQUATION:f(x) = -x^{2} + ax + b]]에 대한 설명이다.\n이차함수 [[EQUATION:y = f(x)]]의 그래프의 축은 직선 [[EQUATION:x = (가)]] 이다. 또한 [[EQUATION:b >= (나)]] 일 때, 이차함수 그래프가 [[EQUATION:x]]축과 만난다. [[EQUATION:-n <= x <= 2n]]에서 함수 [[EQUATION:f(x)]]의 최댓값과 최솟값의 차는 (다) 이다.\n(가), (나), (다) 에 들어갈 양수 [[EQUATION:n]]에 대한 다항식을 각각 [[EQUATION:g(n), h(n), k(n)]]이라 할 때, [[EQUATION:g(2) + h(2) + k(2)]]의 값은?",
    "answer_options": [
      "① [[EQUATION:19]]",
      "② [[EQUATION:21]]",
      "③ [[EQUATION:25]]",
      "④ [[EQUATION:27]]",
      "⑤ [[EQUATION:31]]"
    ],
    "explanation": "[[EQUATION:f(x) = f(3n - x)]]에서 축은 [[EQUATION:x = {3n} over {2}]]입니다. [[EQUATION:g(n) = {3n} over {2}]]\n[[EQUATION:f(x) = -x^{2} + 3nx + b]]가 [[EQUATION:x]]축과 만나려면 판별식 [[EQUATION:D = (3n)^{2} - 4(-1)b = 9n^{2} + 4b >= 0]]\n[[EQUATION:4b >= -9n^{2} \\Rightarrow b >= - {9n^{2}} over {4}]] 이므로 [[EQUATION:h(n) = - {9n^{2}} over {4}]]\n[[EQUATION:-n <= x <= 2n]]에서 축 [[EQUATION:x = 1.5n]]이 포함됩니다.\n최댓값은 [[EQUATION:f(1.5n) = -2.25n^{2} + 4.5n^{2} + b = 2.25n^{2} + b]]\n최솟값은 축에서 가장 먼 [[EQUATION:x = -n]]일 때, [[EQUATION:f(-n) = -n^{2} - 3n^{2} + b = -4n^{2} + b]]\n차이는 [[EQUATION:k(n) = (2.25n^{2} + b) - (-4n^{2} + b) = 6.25n^{2} = {25n^{2}} over {4}]]\n[[EQUATION:g(2) = 3, h(2) = -9, k(2) = 25]]\n[[EQUATION:g(2) + h(2) + k(2) = 3 - 9 + 25 = 19]]\n따라서 정답은 ①입니다."
  },
  {
    "question": "[[EQUATION:11]] 자연수 [[EQUATION:n]]에 대하여\n[[EQUATION:f(n) = n \\times (i + i^{2} + i^{3} + \\dots + i^{n}) \\times ({1} over {i} + {1} over {i^{2}} + {1} over {i^{3}} + \\dots + {1} over {i^{n}})]]\n이라 하자. [[EQUATION:f(k) + f(k + 3) = 105]]가 성립하도록 하는 모든 자연수 [[EQUATION:k]]의 값의 합은?",
    "answer_options": [
      "① [[EQUATION:105]]",
      "② [[EQUATION:139]]",
      "③ [[EQUATION:145]]",
      "④ [[EQUATION:169]]",
      "⑤ [[EQUATION:185]]"
    ],
    "explanation": "[[EQUATION:S_{n} = i + i^{2} + \\dots + i^{n}]]이라 하면 [[EQUATION:{1} over {i} + {1} over {i^{2}} + \\dots + {1} over {i^{n}} = \\overline{S_{n}}]]입니다.\n[[EQUATION:f(n) = n \\times S_{n} \\times \\overline{S_{n}} = n|S_{n}|^{2}]]\n[[EQUATION:|S_{n}|^{2}]]의 값은 [[EQUATION:n]]을 [[EQUATION:4]]로 나눈 나머지에 따라 [[EQUATION:1, 2, 1, 0]]이 반복됩니다.\n[[EQUATION:f(k) + f(k + 3) = 105]]를 만족하는 [[EQUATION:k]]를 찾으면:\n1) [[EQUATION:k = 4m + 1]]일 때: [[EQUATION:k \\times 1 + (k + 3) \\times 0 = 105 \\Rightarrow k = 105]]\n2) [[EQUATION:k = 4m + 2]]일 때: [[EQUATION:k \\times 2 + (k + 3) \\times 1 = 3k + 3 = 105 \\Rightarrow 3k = 102 \\Rightarrow k = 34]]\n3) [[EQUATION:k = 4m + 3]]일 때: [[EQUATION:k \\times 1 + (k + 3) \\times 2 = 3k + 6 = 105 \\Rightarrow 3k = 99 \\Rightarrow k = 33]] (나머지 조건 불일치)\n4) [[EQUATION:k = 4m]]일 때: [[EQUATION:k \\times 0 + (k + 3) \\times 1 = 105 \\Rightarrow k = 102]] (나머지 조건 불일치)\n가능한 [[EQUATION:k]]는 [[EQUATION:105, 34]]이므로 합은 [[EQUATION:139]]입니다.\n따라서 정답은 ②입니다."
  },
  {
    "question": "[[EQUATION:12]] [그림1]과 같이 모든 모서리의 길이가 [[EQUATION:1]]보다 큰 직육면체 모양의 나무토막 [[EQUATION:ABCD - EFGH]]가 있다. 이 나무토막의 한 모퉁이에서 한 모서리의 길이가 [[EQUATION:1]]인 정육면체 모양의 나무토막을 잘라내어 버리고 [그림2]와 같은 입체도형을 만들었다. [그림2]의 입체도형의 겉넓이는 [[EQUATION:236]]이고, 모든 모서리의 길이의 합은 [[EQUATION:82]]일 때, 잘라낸 부분 중 나무토막 안쪽에 생긴 꼭짓점 [[EQUATION:I]]에 대하여 [[EQUATION:HI^{2}]]의 값은?",
    "answer_options": [
      "① [[EQUATION:86]]",
      "② [[EQUATION:87]]",
      "③ [[EQUATION:88]]",
      "④ [[EQUATION:89]]",
      "⑤ [[EQUATION:90]]"
    ],
    "explanation": "직육면체의 세 변의 길이를 [[EQUATION:a, b, c]]라 합시다.\n겉넓이는 변하지 않으므로 [[EQUATION:2(ab + bc + ca) = 236 \\Rightarrow ab + bc + ca = 118]]\n모서리 길이의 합은 [[EQUATION:4(a + b + c) + 6 = 82 \\Rightarrow a + b + c = 19]]\n[[EQUATION:a^{2} + b^{2} + c^{2} = (a + b + c)^{2} - 2(ab + bc + ca) = 19^{2} - 236 = 361 - 236 = 125]]\n[[EQUATION:H]]를 원점으로 하면 [[EQUATION:I = (a - 1, b - 1, c - 1)]]이므로\n[[EQUATION:HI^{2} = (a - 1)^{2} + (b - 1)^{2} + (c - 1)^{2} = a^{2} + b^{2} + c^{2} - 2(a + b + c) + 3 = 125 - 38 + 3 = 90]]\n따라서 정답은 ⑤입니다."
  },
  {
    "question": "[[EQUATION:13]] [[EQUATION:x]] 에 대한 이차방정식 [[EQUATION:x^{2} + mx - m + 4 = 0]] 의 두 근을 [[EQUATION:\\alpha, \\beta]]라 하자. [[EQUATION:\\alpha^{3}]] 이 실수가 되도록 하는 모든 실수 [[EQUATION:m]] 의 값의 합을 [[EQUATION:p]], 곱을 [[EQUATION:q]]라 할 때, [[EQUATION:pq]]의 값은? ([[EQUATION:\\alpha]]는 허수)",
    "answer_options": [
      "① [[EQUATION:-4]]",
      "② [[EQUATION:-1]]",
      "③ [[EQUATION:0]]",
      "④ [[EQUATION:1]]",
      "⑤ [[EQUATION:4]]"
    ],
    "explanation": "[[EQUATION:\\alpha]]가 허수이고 [[EQUATION:\\alpha^{3}]]이 실수이려면 [[EQUATION:\\alpha^{2} + \\alpha\\overline{\\alpha} + \\overline{\\alpha}^{2} = 0]]이어야 합니다.\n[[EQUATION:(\\alpha + \\overline{\\alpha})^{2} - \\alpha\\overline{\\alpha} = 0]]\n근과 계수의 관계에서 [[EQUATION:\\alpha + \\overline{\\alpha} = -m, \\alpha\\overline{\\alpha} = -m + 4]]\n[[EQUATION:(-m)^{2} - (-m + 4) = 0 \\Rightarrow m^{2} + m - 4 = 0]]\n이 방정식의 두 근의 합 [[EQUATION:p = -1]], 곱 [[EQUATION:q = -4]]\n[[EQUATION:pq = (-1) \\times (-4) = 4]]\n따라서 정답은 ⑤입니다."
  },
  {
    "question": "[[EQUATION:14]] 이차함수 [[EQUATION:f(x)]] 가 [[EQUATION:f(0) = f(6)]], [[EQUATION:|f(-1)| + f(4) = 0]]을 만족시킨다. [[EQUATION:-2 <= x <= 5]] 일 때, 함수 [[EQUATION:f(x)]]의 최댓값이 [[EQUATION:66]]이다. 이때 [[EQUATION:f(0)]]의 값은?",
    "answer_options": [
      "① [[EQUATION:-2]]",
      "② [[EQUATION:-1]]",
      "③ [[EQUATION:0]]",
      "④ [[EQUATION:1]]",
      "⑤ [[EQUATION:2]]"
    ],
    "explanation": "[[EQUATION:f(0) = f(6)]]에서 축은 [[EQUATION:x = 3]]입니다. [[EQUATION:f(x) = a(x - 3)^{2} + b]]\n[[EQUATION:|16a + b| + (a + b) = 0]]에서 [[EQUATION:a + b <= 0]]이고 [[EQUATION:a > 0]]임을 알 수 있습니다.\n[[EQUATION:16a + b + a + b = 0 \\Rightarrow 17a + 2b = 0 \\Rightarrow b = -8.5a]]\n[[EQUATION:-2 <= x <= 5]]에서 최댓값은 [[EQUATION:f(-2) = 25a + b = 25a - 8.5a = 16.5a = 66 \\Rightarrow a = 4]]\n[[EQUATION:b = -34]] 이므로 [[EQUATION:f(0) = 9a + b = 36 - 34 = 2]]\n따라서 정답은 ⑤입니다."
  },
  {
    "question": "[[EQUATION:15]] 자연수 [[EQUATION:n]]에 대하여 가로의 길이와 세로의 길이가 각각 [[EQUATION:n^{2} + 4n + 6]], [[EQUATION:n^{2} + 6n + 10]]인 직사각형 모양의 종이가 있다. 이 직사각형의 종이 안에 반지름의 길이가 [[EQUATION:n + 2]]인 원을 그릴 때, 그릴 수 있는 원의 최대 개수를 [[EQUATION:f(n)]]이라 하자. [[EQUATION:f(m) = 42]]이 되는 모든 자연수 [[EQUATION:m]]의 값의 합은?",
    "answer_options": [
      "① [[EQUATION:15]]",
      "② [[EQUATION:17]]",
      "③ [[EQUATION:19]]",
      "④ [[EQUATION:21]]",
      "⑤ [[EQUATION:23]]"
    ],
    "explanation": "원의 지름은 [[EQUATION:2n + 4]]입니다.\n[[EQUATION:f(n) = [ {n^{2} + 4n + 6} over {2n + 4} ] \\times [ {n^{2} + 6n + 10} over {2n + 4} ] = [ {n} over {2} + 1 + {2} over {2n + 4} ] \\times [ {n} over {2} + 2 + {2} over {2n + 4} ]]]\n[[EQUATION:f(n) = [ {n} over {2} + 1 ] \\times [ {n} over {2} + 2 ] = 42 = 6 \\times 7]]\n[[EQUATION:[ {n} over {2} ] + 1 = 6 \\Rightarrow [ {n} over {2} ] = 5]]\n따라서 [[EQUATION:n = 10, 11]] 이며 합은 [[EQUATION:21]]입니다.\n따라서 정답은 ④입니다."
  },
  {
    "question": "[[EQUATION:16]] [[EQUATION:0]]이 아닌 복소수 [[EQUATION:z]]에 대하여 [[EQUATION:z]]의 실수부분이 [[EQUATION:a]], 허수부분이 [[EQUATION:b]]일 때, [[EQUATION:|z| = sqrt{a^{2} + b^{2}}]] 라 하고, [[EQUATION:{|z|} over {z} - \\overline{z} = (1 + \\overline{z} + {\\overline{z}} over {z})i]]를 만족시키는 복소수 [[EQUATION:z]]를 [[EQUATION:\\alpha]]라 하자. 임의의 복소수 [[EQUATION:z]]에 대하여 [[EQUATION:\\alpha z^{3} + \\beta(\\overline{z})^{3}]]이 실수가 되도록 하는 복소수 [[EQUATION:\\beta]]를 [[EQUATION:\\beta = p + qi]]라 할 때, [[EQUATION:p^{2} + q^{2}]]의 값은? (단, [[EQUATION:a, b, p, q]]는 실수)",
    "answer_options": [
      "① [[EQUATION:1]]",
      "② [[EQUATION:2]]",
      "③ [[EQUATION:3]]",
      "④ [[EQUATION:4]]",
      "⑤ [[EQUATION:5]]"
    ],
    "explanation": "주어진 식을 정리하면 [[EQUATION:|z| = 1]]과 [[EQUATION:a = - {1} over {2}]]을 얻습니다. 즉 [[EQUATION:|\\alpha| = 1]]입니다.\n[[EQUATION:\\alpha z^{3} + \\beta \\overline{z}^{3}]]이 실수이려면 [[EQUATION:\\beta = \\overline{\\alpha}]]이어야 합니다.\n[[EQUATION:p^{2} + q^{2} = |\\beta|^{2} = |\\overline{\\alpha}|^{2} = |\\alpha|^{2} = 1]]\n따라서 정답은 ①입니다."
  },
  {
    "question": "[[EQUATION:17]] 이차방정식 [[EQUATION:x^{2} - 3x + 5 = 0]]의 서로 다른 두 근을 [[EQUATION:\\alpha, \\beta]] 라 할 때, [[EQUATION:{1} over {\\alpha^{2} - 2\\alpha + 5} + {1} over {\\beta^{2} - 2\\beta + 5}]] 의 값을 구하시오. [서]",
    "explanation": "[[EQUATION:\\alpha^{2} - 3\\alpha + 5 = 0]]에서 [[EQUATION:\\alpha^{2} + 5 = 3\\alpha]]입니다.\n분모 [[EQUATION:\\alpha^{2} - 2\\alpha + 5 = (\\alpha^{2} + 5) - 2\\alpha = 3\\alpha - 2\\alpha = \\alpha]]\n마찬가지로 [[EQUATION:\\beta^{2} - 2\\beta + 5 = \\beta]]\n구하는 값은 [[EQUATION:{1} over {\\alpha} + {1} over {\\beta} = {\\alpha + \\beta} over {\\alpha\\beta} = {3} over {5}]]"
  },
  {
    "question": "[[EQUATION:18]] 삼각형 [[EQUATION:ABC]]의 세 변의 길이 [[EQUATION:a, b, c]] 가 등식 [[EQUATION:a^{3} + b^{3} + c^{3} = 3abc = 81]]을 만족시킬 때, 인수분해를 이용하여 삼각형 [[EQUATION:ABC]] 의 넓이를 구하시오. [서]",
    "explanation": "[[EQUATION:a^{3} + b^{3} + c^{3} - 3abc = (a + b + c)(a^{2} + b^{2} + c^{2} - ab - bc - ca) = 0]]\n[[EQUATION:a, b, c]]는 변의 길이이므로 [[EQUATION:a + b + c != 0]]\n따라서 [[EQUATION:a^{2} + b^{2} + c^{2} - ab - bc - ca = 0 \\Rightarrow a = b = c]]\n[[EQUATION:3a^{3} = 81 \\Rightarrow a^{3} = 27 \\Rightarrow a = 3]]\n한 변의 길이가 [[EQUATION:3]]인 정삼각형의 넓이는 [[EQUATION:{sqrt{3}} over {4} \\times 3^{2} = {9sqrt{3}} over {4}]]"
  },
  {
    "question": "[[EQUATION:19]] [[EQUATION:x]]에 대한 다항식 [[EQUATION:x^{n}(x^{2} + ax + b)]]를 [[EQUATION:(x - 2)^{2}]]으로 나누었을 때의 나머지가 [[EQUATION:2^{n}(x - 2)]]일 때, 두 상수 [[EQUATION:a, b]] 에 대하여 [[EQUATION:a + b]]의 값을 구하시오. (단, [[EQUATION:n]] 은 자연수이다.) [서]",
    "explanation": "[[EQUATION:x^{n}(x^{2} + ax + b) = (x - 2)^{2}Q(x) + 2^{n}(x - 2)]]\n[[EQUATION:x = 2]]를 대입하면 [[EQUATION:2^{n}(4 + 2a + b) = 0 \\Rightarrow b = -2a - 4]]\n[[EQUATION:x^{n}(x - 2)(x + a + 2) = (x - 2)^{2}Q(x) + 2^{n}(x - 2)]]\n양변을 [[EQUATION:x - 2]]로 나누면 [[EQUATION:x^{n}(x + a + 2) = (x - 2)Q(x) + 2^{n}]]\n다시 [[EQUATION:x = 2]]를 대입하면 [[EQUATION:2^{n}(4 + a) = 2^{n} \\Rightarrow 4 + a = 1 \\Rightarrow a = -3]]\n[[EQUATION:b = -2(-3) - 4 = 2]]\n따라서 [[EQUATION:a + b = -3 + 2 = -1]]"
  },
  {
    "question": "[[EQUATION:20]] 그림의 직사각형 [[EQUATION:ABCD]] 에서 두 점 [[EQUATION:A, B]] 는 [[EQUATION:x]] 축 위에 있고, 두 점 [[EQUATION:C, D]] 는 이차함수 [[EQUATION:y = -x^{2} + 8x]]의 그래프 위에 있다. 각 물음에 답하시오. [서]\n⑴ 이차함수의 대칭축을 이용하여 점 [[EQUATION:A, B, C, D]] 의 좌표를 구하시오.\n⑵ 직사각형 [[EQUATION:ABCD]] 의 둘레의 길이의 최댓값을 구하시오.",
    "explanation": "축은 [[EQUATION:x = 4]]입니다. [[EQUATION:A(4 - t, 0), B(4 + t, 0), C(4 - t, -t^{2} + 16), D(4 + t, -t^{2} + 16)]] (단, [[EQUATION:0 < t < 4]])\n둘레 [[EQUATION:L = 2(2t + (-t^{2} + 16)) = -2t^{2} + 4t + 32 = -2(t - 1)^{2} + 34]]\n[[EQUATION:t = 1]]일 때 최댓값 [[EQUATION:34]]를 갖습니다.\n좌표는 [[EQUATION:A(3, 0), B(5, 0), C(3, 15), D(5, 15)]]입니다."
  },
  {
    "question": "[[EQUATION:21]] 다항식 [[EQUATION:f(x)]]가 다음 조건을 만족시킨다.\n㈎ 다항식 [[EQUATION:f(x)]]를 다항식 [[EQUATION:g(x)]]로 나눈 몫과 나머지는 모두 [[EQUATION:g(x) - x^{4}]]이다.\n㈏ [[EQUATION:g(x)]]를 [[EQUATION:x]]로 나눈 나머지는 [[EQUATION:1]]이다.\n㈐ [[EQUATION:g(x)]]를 [[EQUATION:x^{2} - x + 1]]로 나눈 나머지는 [[EQUATION:x - 3]]이다.\n㈑ [[EQUATION:g(x)]]를 [[EQUATION:x^{3} + 1]]로 나눈 몫은 [[EQUATION:x - 2]]이다.\n[[EQUATION:f(-1)]]의 값을 구하시오. [단]",
    "explanation": "조건 (가)에서 [[EQUATION:g(x)]]의 최고차항은 [[EQUATION:x^{4}]]입니다.\n조건 (라)에서 [[EQUATION:g(x) = (x^{3} + 1)(x - 2) + ax^{2} + bx + c]]\n조건 (나)에서 [[EQUATION:g(0) = -2 + c = 1 \\Rightarrow c = 3]]\n조건 (다)에서 [[EQUATION:g(x)]]를 [[EQUATION:x^{2} - x + 1]]로 나눈 나머지를 구하면 [[EQUATION:a = 6, b = -4]]를 얻습니다.\n[[EQUATION:g(x) = x^{4} - 2x^{3} + 6x^{2} - 4x + 1]]\n[[EQUATION:g(-1) = 14]] 이고 [[EQUATION:f(x) = (g(x) + 1)(g(x) - x^{4})]] 이므로\n[[EQUATION:f(-1) = (14 + 1)(14 - 1) = 15 \\times 13 = 195]]"
  },
  {
    "question": "[[EQUATION:22]] 두 이차함수 [[EQUATION:f(x) = (x - a)^{2} - a^{2}]], [[EQUATION:g(x) = -(x - 3a)^{2} + 9a^{2} + b]] 가 다음 조건을 만족시킨다.\n㈎ 방정식 [[EQUATION:f(x) = g(x)]]는 서로 다른 두 실근 [[EQUATION:\\alpha, \\beta]] 를 갖는다.\n㈏ [[EQUATION:\\beta - \\alpha = 4]]\n㈐ [[EQUATION:g(\\beta) = f(\\alpha) + 10a^{2} + b]]\n실수 전체에서 함숫값 [[EQUATION:f(x), g(x)]] 중 큰 것을 [[EQUATION:h(x)]]라 하자. [[EQUATION:h(x) = 3x + k]]의 서로 다른 실근의 개수가 [[EQUATION:4]]가 되도록 하는 모든 실수 [[EQUATION:k]]의 범위는 [[EQUATION:p < k < q]]이다. 이때, [[EQUATION:2pq]]의 값을 구하시오. [단]",
    "explanation": "조건을 통해 [[EQUATION:a = 2, b = -24]]를 구합니다.\n[[EQUATION:f(x) = x^{2} - 4x, g(x) = -x^{2} + 12x - 24]]\n[[EQUATION:h(x)]]는 [[EQUATION:x <= 2]] 또는 [[EQUATION:x >= 6]]에서 [[EQUATION:f(x)]], [[EQUATION:2 < x < 6]]에서 [[EQUATION:g(x)]]입니다.\n[[EQUATION:y = 3x + k]]가 [[EQUATION:h(x)]]와 [[EQUATION:4]]개의 점에서 만나려면\n[[EQUATION:k]]는 점 [[EQUATION:(6, 12)]]를 지날 때([[EQUATION:k = -6]])와 [[EQUATION:g(x)]]에 접할 때([[EQUATION:k = -3.75]]) 사이여야 합니다.\n[[EQUATION:p = -6, q = -3.75]] 이므로 [[EQUATION:2pq = 2 \\times (-6) \\times (-3.75) = 45]]"
  }
]"""
def sanitize_json(text):
    # 1. LaTeX 기호 보호 (자주 쓰이는 기호들) - 이미 이중 백슬래시(\\)로 되어있는 경우는 제외
    # (?<!\\\\) 는 바로 앞에 백슬래시가 없는 경우만 매칭
    latex_keywords_regex = r'(?<!\\\\)\\(times|tan|rightarrow|Rightarrow|rho|frac|beta|bar|nabla|neq|ni|theta|tau|varphi|phi|pi|psi|nu|mu|lambda|kappa|iota|eta|zeta|epsilon|delta|gamma|alpha|omega|chi|upsilon|sigma|xi|Theta|Phi|Pi|Psi|Lambda|Delta|Gamma|Omega|Sigma|Xi|Upsilon|cdot|sqrt|left|right|sum|prod|int|oint|lim|infty|approx|equiv|propto|sim|simeq|asymp|doteq|implies)'
    text = re.sub(latex_keywords_regex, r'\\\\\1', text)
    
    # 2. 기타 알 수 없는 단일 백슬래시도 안전하게 이중화 (이미 이중 백슬래시인 경우 제외)
    text = re.sub(r'(?<!\\\\)\\([^"\\/bfnrtu])', r'\\\\\1', text)
    return text

print("Sanitizing...")
sanitized = sanitize_json(raw_response)

print("Trying json.loads...")
try:
    problems = json.loads(sanitized)
    print(f"Success! {len(problems)} items parsed.")
except Exception as e:
    print(f"Error parsing json: {e}")

    print("Running truncation recovery logic...")
    fixed_text = sanitized
    while fixed_text:
        last_brace = fixed_text.rfind('}')
        if last_brace == -1:
            break
        attempt_text = fixed_text[:last_brace+1] + '\n]'
        try:
            problems = json.loads(attempt_text)
            print(f"Truncated JSON fixed iter-automatically. Extracted {len(problems)} items.")
            break
        except Exception:
            fixed_text = fixed_text[:last_brace]
