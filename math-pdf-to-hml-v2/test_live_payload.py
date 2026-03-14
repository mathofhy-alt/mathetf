import json
import re

with open("gemini_debug_log.txt", "r", encoding="utf-8") as f:
    raw = f.read()

try:
    response_text = raw.split("=== RAW GEMINI RESPONSE ===\n")[1].split("\n===========================")[0]
    if "```json" in response_text:
        response_text = response_text.split("```json")[1]
    if "```" in response_text:
        response_text = response_text.split("```")[0]
    response_text = response_text.strip()
    
    latex_keywords_regex = r'\\(times|tan|rightarrow|Rightarrow|rho|frac|beta|bar|nabla|neq|ni|theta|tau|varphi|phi|pi|psi|nu|mu|lambda|kappa|iota|eta|zeta|epsilon|delta|gamma|alpha|omega|chi|upsilon|sigma|xi|Theta|Phi|Pi|Psi|Lambda|Delta|Gamma|Omega|Sigma|Xi|Upsilon|cdot|sqrt|left|right|sum|prod|int|oint|lim|infty|approx|equiv|propto|sim|simeq|asymp|doteq|implies)'
    response_text = re.sub(latex_keywords_regex, r'\\\\\1', response_text)
    
    response_text = re.sub(r'(?<!\\)\\([^"\\/bfnrtu])', r'\\\\\1', response_text)
    
    json.loads(response_text)
    print("SUCCESS: JSON parses correctly!")
except Exception as e:
    print("ERROR parsing JSON:", e)
    
    # Run recovery logic to see where it truncates
    fixed_text = response_text
    while fixed_text:
        last_brace = fixed_text.rfind('}')
        if last_brace == -1:
            break
        attempt_text = fixed_text[:last_brace+1] + '\n]'
        try:
            problems = json.loads(attempt_text)
            print(f"Truncation logic recovered {len(problems)} items.")
            break
        except Exception:
            fixed_text = fixed_text[:last_brace]
