with open('gemini_client.py', 'r', encoding='utf-8') as f:
    code = f.read()
import re
func_match = re.search(r'def _latex_to_hwp\(s\):.*?(?=def _clean_hwp|def )', code, re.DOTALL)
if func_match:
    func_code = func_match.group(0)
    # _extract_braced code
    extract_match = re.search(r'def _extract_braced\(s, pos\):.*?(?=def _latex_to_hwp)', code, re.DOTALL)
    exec(extract_match.group(0) + func_code)
    print('_latex_to_hwp for f(x^2):', locals().get('_latex_to_hwp', lambda x: None)('f(x^2)'))
    print('_latex_to_hwp for f(x^2):', locals().get('_latex_to_hwp', lambda x: None)('f(x^{2})'))
    print('_latex_to_hwp for f(x^2) using eval:', eval('_latex_to_hwp("f(x^2)")'))
else:
    print('func not found')
