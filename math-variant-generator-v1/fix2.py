import codecs

path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-variant-generator-v1\main.py'
with codecs.open(path, 'r', 'utf-8', errors='replace') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if 89 <= i <= 95:
        if i == 89:
            new_lines.append('        self.gemini_models = [\n')
            new_lines.append('            "Option 1",\n')
            new_lines.append('            "Option 2",\n')
            new_lines.append('            "Option 3",\n')
            new_lines.append('            "Option 4",\n')
            new_lines.append('            "Option 5"\n')
        continue
    new_lines.append(line)

with codecs.open(path, 'w', 'utf-8') as f:
    f.writelines(new_lines)
