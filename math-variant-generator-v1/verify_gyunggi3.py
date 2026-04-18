import json

with open('debug_gyunggi.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for d in data[14:]:
    print(f"[{d.get('question_num')}]")
    print(f"Q: {d.get('question')}")
    print("-" * 50)
