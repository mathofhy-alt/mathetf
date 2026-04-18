import json
from hml_generator import HMLGenerator

print("Loading debug JSON...")
with open('debug_e1_v10.1.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("Regenerating HML with newline fix...")
gen = HMLGenerator()
for idx, p in enumerate(data, 1):
    gen.add_problem(p, idx)

gen.save('dist/e1_fixed.hml')
print("Saved to dist/e1_fixed.hml! If you open this file, paragraphs should be properly separated.")
