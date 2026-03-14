import re

def sanitize_json(text):
    # 1. LaTeX 기호 보호 (V3 원본 버전) - negative lookbehind 추가하여 이미 이중화된 백슬래시 보호
    latex_keywords_regex = r'(?<!\\)\\(times|tan|rightarrow|Rightarrow|rho|frac|beta|bar|nabla|neq|ni|theta|tau|varphi|phi|pi|psi|nu|mu|lambda|kappa|iota|eta|zeta|epsilon|delta|gamma|alpha|omega|chi|upsilon|sigma|xi|Theta|Phi|Pi|Psi|Lambda|Delta|Gamma|Omega|Sigma|Xi|Upsilon|cdot|sqrt|left|right|sum|prod|int|oint|lim|infty|approx|equiv|propto|sim|simeq|asymp|doteq|implies)'
    text = re.sub(latex_keywords_regex, r'\\\\\1', text)
    
    # 2. 기타 알 수 없는 단일 백슬래시도 안전하게 이중화 (이부분은 이미 lookbehind가 있음)
    text = re.sub(r'(?<!\\)\\([^"\\/bfnrtu])', r'\\\\\1', text)
    return text

print("ORIGINAL \\\\alpha (escaped correctly):", repr(r"\\alpha"))
print("SANITIZED \\\\alpha:", repr(sanitize_json(r"\\alpha")))

print("ORIGINAL \\alpha (escaped incorrectly):", repr(r"\alpha"))
print("SANITIZED \\alpha:", repr(sanitize_json(r"\alpha")))
