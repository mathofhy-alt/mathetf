import codecs
import re

path = r'c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-variant-generator-v1\main.py'
with codecs.open(path, 'r', 'utf-8', errors='replace') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    line = re.sub(r'text="([^"]*[\?])(,|(?=\)))', r'text="\1"\2', line)
    line = re.sub(r'text="([^"]*[\?])(, width)', r'text="\1"\2', line)
    line = re.sub(r'\("([^"]*[\?])\)', r'("\1")', line)
    line = re.sub(r'="([^"]*[\?]),', r'="\1",', line)
    if 'self.difficulties =' in line:
        line = '        self.difficulties = ["Level 1", "Level 2", "Level 3"]\n'
    if 'messagebox.showinfo(' in line or 'messagebox.showerror(' in line:
        line = re.sub(r'("[^"]*[\?])([^"])', r'\1"\2', line)
    lines[i] = line

with codecs.open(path, 'w', 'utf-8') as f:
    f.writelines(lines)
