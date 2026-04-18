from gemini_client import GeminiMathParser
import json_repair
from latex_hwp_compiler import compile_latex_to_hwp

raw = r'{"eq": "\\begin{cases} x & (x < 0) \\\\ y & (x \\ge 0) \\end{cases}"}'
parser = GeminiMathParser(api_key="mock")
sani = parser._sanitize_json(raw)
print("SANI: ", repr(sani))
parsed = json_repair.loads(sani)
print("PARSED: ", repr(parsed['eq']))
hwp = compile_latex_to_hwp(parsed.get('eq', ''))
print("HWP: ", hwp)
