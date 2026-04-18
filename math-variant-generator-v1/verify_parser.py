import sys
from latex_hwp_compiler import compile_latex_to_hwp

test_cases = [
    # 1. 띄어쓰기가 문제가 되었던 문자 결합
    r"2x^2 - 4ac + 3xy = 0",
    # 2. 극한과 분수 형태
    r"\lim_{x \to \infty} \frac{f(x)}{x^2} = 3",
    # 3. 루트 내부 다항식
    r"\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}",
    # 4. 연립 방정식
    r"\begin{cases} 2x + 3y = 5 \\ 4x - y = 1 \end{cases}",
    # 5. 행렬
    r"\begin{pmatrix} x & 2 \\ 3 & y \end{pmatrix}",
    # 6. 상단/하단 수식 기호 (선분, 벡터)
    r"\overline{AB}^{2} + \overline{BC}^{2} = \overline{CA}^{2}",
    # 7. 집합 표현 (자주 나오며, 중괄호가 묶임)
    r"A = \left\{ x | x^2 - 4 > 0 \right\}",
    # 8. 미적분 기호
    r"\int_0^1 x^2 + 2x \, dx",
    # 9. 복잡한 다중 첨자
    r"a_{n+1} = a_n + d"
]

print("="*60)
print("AST Parser HWP Output Verification")
print("="*60)

for i, tex in enumerate(test_cases, 1):
    parsed = compile_latex_to_hwp(tex)
    print(f"[TEST {i}]")
    print(f"LaTeX Input: {tex}")
    print(f"HWP Output : {parsed}")
    print("-" * 60)
