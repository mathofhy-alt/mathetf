import json

with open("debug_e1_hybrid.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print(f"Total extracted items: {len(data)}")

missing_q = []
missing_e = []

for i, item in enumerate(data, 1):
    q = item.get("question", "").strip()
    e = item.get("explanation", "").strip()
    
    if not q:
        missing_q.append(item.get("question_num", str(i)))
    if not e:
        missing_e.append(item.get("question_num", str(i)))

print(f"Items missing question text: {missing_q}")
print(f"Items missing explanation text: {missing_e}")

if not missing_q and not missing_e:
    print("ALL 22 items have both question and explanation successfully extracted!")
else:
    print("Some items are missing required fields.")
