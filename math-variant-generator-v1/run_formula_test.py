from hml_generator import HMLGenerator

def test_formulas():
    g = HMLGenerator()
    
    # User's reported failing formulas from previous versions
    formulas = [
        # Test 1: Pmod corruption (+- od) -> Should remain pmod
        r"[[EQUATION:f(x)-g(x) \equiv 2 \pmod{x^{2}+x+1}]]",
        
        # Test 2: cdots + fractions + times
        r"[[EQUATION:f(n) = n \times (i+i^{2}+i^{3}+\cdots +i^{n}) \times \left ( \frac{1}{i}+\frac{1}{i^{2}} + \cdots + \frac{1}{i^{n}} \right )]]",
        
        # Test 3: Greek, Limits, Infinity
        r"[[EQUATION:\lim_{x \to \infty} \frac{\sin(\alpha x)}{\beta x} \equiv 1]]",
        
        # Test 4: Cases / Matrix
        r"[[EQUATION:f(x) = \begin{cases} x & x \geq 0 \\ -x & x < 0 \end{cases}]]",
        
        # Test 5: Triangle, angle, circ
        r"[[EQUATION:\triangle ABC, \angle A = 90^\circ]]",
    ]
    
    print("==================================================")
    print("🚀 HWP Math Master Dictionary Testbed")
    print("==================================================\n")
    
    for i, f in enumerate(formulas, 1):
        print(f"[{i}] 원본 (LaTeX): {f}")
        try:
            hwp_out = g._parse_text_to_hml(f)
            # Extract just the <SCRIPT> content from the HML block to make it readable
            import re
            script_match = re.search(r'<SCRIPT>(.*?)</SCRIPT>', hwp_out)
            if script_match:
                print(f"    ▶ 변환 (HWP):   {script_match.group(1)}\n")
            else:
                print(f"    ▶ 변환 (ERROR): HWP Script 태그를 찾을 수 없습니다.\n")
        except Exception as e:
            print(f"    ▶ 변환 (CRASH): {e}\n")

if __name__ == "__main__":
    test_formulas()
