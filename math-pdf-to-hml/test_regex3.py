import re
text = r'Valid: \\alpha, Invalid: \alpha, Valid: \\times, Invalid: \times, Newline: \n'
r1 = r'(?<!\\)\\(times|tan|rightarrow|Rightarrow|rho|frac|beta|bar|nabla|neq|ni|theta|tau|varphi|phi|pi|psi|nu|mu|lambda|kappa|iota|eta|zeta|epsilon|delta|gamma|alpha|omega|chi|upsilon|sigma|xi|Theta|Phi|Pi|Psi|Lambda|Delta|Gamma|Omega|Sigma|Xi|Upsilon|cdot|sqrt|left|right|sum|prod|int|oint|lim|infty|approx|equiv|propto|sim|simeq|asymp|doteq|implies)'
text = re.sub(r1, r'\\\\\1', text)
text = re.sub(r'(?<!\\)\\([^"\\/bfnrtu])', r'\\\\\1', text)
print(text)
