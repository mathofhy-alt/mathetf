path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\src\app\question-bank\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Check for the problematic pattern from fix_mobile.py #2
# It did content.replace('<div className="flex gap-2">', '<div className="hidden sm:flex gap-2">', 1)
# But that could have replaced the wrong div!

# Find all instances of hidden sm:flex gap-2
import re
for m in re.finditer(r'hidden sm:flex gap-2', content):
    start = max(0, m.start()-50)
    end = min(len(content), m.end()+100)
    print(f"Position {m.start()}: ...{repr(content[start:end])}...")
    print()
