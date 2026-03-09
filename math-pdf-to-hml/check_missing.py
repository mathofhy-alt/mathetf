import json
import re

try:
    with open('raw_gemini_output.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    extracted_nums = []
    for q in data:
        q_text = q.get('question', '')
        # 첫 번째 숫자를 문제 번호로 간주
        match = re.search(r'^(\d+)', q_text.strip())
        if match:
            extracted_nums.append(int(match.group(1)))
        else:
            match = re.search(r'(\d+)', q_text)
            if match:
                 extracted_nums.append(int(match.group(1)))
            
    extracted_nums.sort()
    print("Extracted numbers:", extracted_nums)
    expected = list(range(1, 23))
    missing = [x for x in expected if x not in extracted_nums]
    print("Missing numbers:", missing)
except Exception as e:
    print("Error:", e)
