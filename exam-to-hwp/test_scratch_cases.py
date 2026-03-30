import sys
sys.path.append(r'C:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\exam-to-hwp')
from latex_parser import parse_latex

test_str1 = r'h(x) = \left\{ \begin{matrix} f(x) & (x < \alpha \text{ 또는 } x > \beta) \\ g(x) & (\alpha \le x \le \beta) \end{matrix} \right.'

test_str2 = r'h(x) = \begin{cases} f(x) & (x < \alpha \text{ 또는 } x > \beta) \\ g(x) & (\alpha \le x \le \beta) \end{cases}'

print("TEST 1:", parse_latex(test_str1))
print("TEST 2:", parse_latex(test_str2))
