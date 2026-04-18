import json
import json_repair

sani = r'{"eq": "\\begin{cases} x & (x < 0) \\\\\\\\ y & (x \\ge 0) \\end{cases}"}'
print("JSON LOADS: ", repr(json.loads(sani)['eq']))
print("JSON_REPAIR LOADS: ", repr(json_repair.loads(sani)['eq']))
