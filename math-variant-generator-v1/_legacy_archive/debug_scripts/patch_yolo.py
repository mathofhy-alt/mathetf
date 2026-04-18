import os

filepath = r"c:\Users\matho\OneDrive\바탕 화면\안티그래비티 - 복사본\math-pdf-to-hml-v13\yolo_train.py"

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
in_train_block = False

for line in lines:
    if line.startswith("#  3. YOLOv8 학습"):
        new_lines.append("if __name__ == '__main__':\n")
        new_lines.append("    " + line)
        in_train_block = True
    elif in_train_block:
        new_lines.append("    " + line)
    else:
        new_lines.append(line)

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("YOLO_PATCH_COMPLETE")
