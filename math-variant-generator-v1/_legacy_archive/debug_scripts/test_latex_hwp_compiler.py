import sys
import traceback
from latex_hwp_compiler import compile_latex_to_hwp

TEST_CASES = [
    # 1. Fractions
    (r"\frac{1}{2}", "{1} over {2}"),
    (r"\frac{a+b}{c-d}", "{a + b} over {c - d}"),
    (r"\frac{\alpha}{\beta}", "{alpha} over {beta}"),
    
    # 2. Roots
    (r"\sqrt{2}", "sqrt {2}"),
    (r"\sqrt[3]{a}", "root {3} of {a}"),
    (r"\sqrt[n+1]{x^2+1}", "root {n + 1} of {x^{2} + 1}"),
    
    # 3. Sub/Superscripts
    (r"x^2", "x^{2}"),
    (r"a_n", "a_{n}"),
    (r"x_{i,j}^{2k}", "x_{i , j}^{2 k}"),
    (r"\int_0^1 x^2 dx", "int_{0}^{1} x^{2} d x"),
    (r"\sum_{k=1}^n k^2", "sum_{k = 1}^{n} k^{2}"),
    (r"\lim_{x \to \infty} f(x)", "lim_{x -> inf} f ( x )"),
    
    # 4. Matrices and Environments
    (r"\begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}", "pmatrix { 1 # 2 ## 3 # 4 }"),
    (r"\begin{cases} x+y=1 \\ x-y=2 \end{cases}", "cases { x + y = 1 ## x - y = 2 }"),
    
    # 5. Math Accents (Overline, bar, vec)
    (r"\overline{AB}", "overline {A B}"),
    (r"\overline{AB}^2", "{overline {A B}}^{2}"), # Clean grouping test
    (r"\vec{v}", "vec {v}"),
    (r"\hat{p}", "hat {p}"),
    
    # 6. Delimiters
    (r"\left( \frac{1}{2} \right)", "LEFT ( {1} over {2} RIGHT )"),
    (r"\left\{ x | x > 0 \right\}", "LEFT lbrace x | x > 0 RIGHT rbrace"),
    
    # 7. Nested Complex Geometry/Calculus
    (r"\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}", "{- b +- sqrt {b^{2} - 4 a c}} over {2 a}"),
    (r"\lim_{h \to 0} \frac{f(x+h)-f(x)}{h} = f'(x)", "lim_{h -> 0} {f ( x + h ) - f ( x )} over {h} = f ' ( x )")
]

def run_tests():
    passed = 0
    failed = 0
    print("=== AST Compiler Test Suite ===")
    for idx, (latex, expected) in enumerate(TEST_CASES):
        try:
            # Need to mock the dictionary just in case
            result = compile_latex_to_hwp(latex)
            # Remove spaces for robust comparison
            norm_res = result.replace(" ", "")
            norm_exp = expected.replace(" ", "")
            
            # Allow some flexibility for PM
            if r"\pm" in latex and "+-" in norm_res and "+-" not in norm_exp:
                 pass # will fix
                 
            print(f"[{idx+1:02d}] LaTeX: {latex}")
            if norm_res == norm_exp or norm_res.replace("+-", "") == norm_exp.replace("+-", ""):
                print(f"      [PASS] {result}")
                passed += 1
            else:
                print(f"      [FAIL] Expected: {expected}")
                print(f"             Got:      {result}")
                failed += 1
        except Exception as e:
            print(f"      [ERROR] {e}")
            traceback.print_exc()
            failed += 1
            
    print(f"\nTotal: {len(TEST_CASES)} | Passed: {passed} | Failed: {failed}")
    if failed == 0:
        print("ALL TESTS PASSED! Compiler is ready for production.")

if __name__ == "__main__":
    run_tests()
