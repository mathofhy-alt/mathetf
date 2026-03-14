import json

try:
    data = json.load(open('raw_gemini_output.json', encoding='utf-8'))
    print('Total:', len(data))
    print('Empty Q:', [i for i, x in enumerate(data) if not x.get('question', '').strip()])
    print('Empty E:', [i for i, x in enumerate(data) if not x.get('explanation', '').strip()])
except Exception as e:
    print('Error:', e)
