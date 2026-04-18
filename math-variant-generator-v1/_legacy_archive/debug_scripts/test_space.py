with open('gemini_client.py', 'r', encoding='utf-8') as f:
    code = f.read()
import re
func_match = re.search(r'(def _extract_braced.*?)(?=def _clean_hwp|def )', code, re.DOTALL)
if func_match:
    exec(func_match.group(1))
    print('f(x^2) ->', locals().get('_latex_to_hwp')('f(x^2)'))
    print('f(x^{2}) ->', locals().get('_latex_to_hwp')('f(x^{2})'))
