import json
import re
from hml_generator import HMLGenerator

gen = HMLGenerator()
with open('debug_e1_v10.1.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for p in data:
    for key in ['question', 'thought_process', 'explanation']:
        if key in p:
            val = p[key]
            if isinstance(val, str):
                output = gen._parse_text_to_hml(val)
                scripts = re.findall(r'<SCRIPT>(.*?)</SCRIPT>', output)
                for s in scripts:
                    if re.search(r'[가-힣]', s):
                        print(f"BINGO in {p['question_num']} - {key}: {s}")
