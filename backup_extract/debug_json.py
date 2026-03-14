import json

with open("test_json_error.py", "r", encoding="utf-8") as f:
    text = f.read().split('raw_response = r"""')[1].split('"""')[0]

# 1. Original regex version
import re
latex_keywords_regex = r'(?<!\\)\\(times|tan|rightarrow|Rightarrow|rho|frac|beta|bar|nabla|neq|ni|theta|tau|varphi|phi|pi|psi|nu|mu|lambda|kappa|iota|eta|zeta|epsilon|delta|gamma|alpha|omega|chi|upsilon|sigma|xi|Theta|Phi|Pi|Psi|Lambda|Delta|Gamma|Omega|Sigma|Xi|Upsilon|cdot|sqrt|left|right|sum|prod|int|oint|lim|infty|approx|equiv|propto|sim|simeq|asymp|doteq|implies)'
text1 = re.sub(latex_keywords_regex, r'\\\\\1', text)
text1 = re.sub(r'(?<!\\)\\([^"\\/bfnrtu])', r'\\\\\1', text1)
try:
    json.loads(text1)
    print("Version 1 (Original Regex) OK")
except Exception as e:
    print("Version 1 Error:", e)

# 2. String replace version
text2 = text.replace('\\\\', '\\').replace('\\', '\\\\')
text2 = text2.replace('\n', '\\n').replace('\r', '')
try:
    json.loads(text2)
    print("Version 2 (String Replace) OK")
except Exception as e:
    print("Version 2 Error:", e)

