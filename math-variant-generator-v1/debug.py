import json
import json_repair
from gemini_client import GeminiMathParser
from latex_hwp_compiler import compile_latex_to_hwp

raw = r'{"eq": "\\begin{cases} x & (x < 0) \\\\ y & (x \\ge 0) \\end{cases}"}'
print("1. RAW INPUT STR: ", repr(raw))

parser = GeminiMathParser(api_key="mock")
sani = parser._sanitize_json(raw)
print("\n2. SANITIZED STR: ", repr(sani))

parsed = json_repair.loads(sani)
eq = parsed.get("eq", "")
print("\n3. PARSED JSON EQ: ", repr(eq))

comp = compile_latex_to_hwp(eq)
print("\n4. COMPILED HWP: ", repr(comp))
