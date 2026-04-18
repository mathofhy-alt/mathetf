import json
from hml_generator import HMLGenerator

data = json.load(open("debug_abtest.json", encoding="utf-8"))
gen = HMLGenerator()
for i, p in enumerate(data):
    gen.add_problem(p, i+1)
gen.save("test_output_abtest.hml")
print("Generated test_output_abtest.hml")
