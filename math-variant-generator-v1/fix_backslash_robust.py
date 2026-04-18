import sys

with open('gemini_client.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if 'text = text.replace(\'\\\\\\\\\', \'@@BR@@\')' in line:
        skip = True
        new_lines.append("        text = text.replace('\\\\\\\\\\\\\\\\', '@@TWO@@')\n")
        new_lines.append("        text = text.replace('\\\\\\\\', '@@TWO@@')\n")
        new_lines.append("        text = text.replace('\\\\', '@@ONE@@')\n")
        new_lines.append("        for cmd in latex_cmds:\n")
        new_lines.append("            text = text.replace('@@TWO@@' + cmd, '\\\\\\\\' + cmd)\n")
        new_lines.append("            text = text.replace('@@ONE@@' + cmd, '\\\\\\\\' + cmd)\n")
        new_lines.append("        text = text.replace('@@TWO@@', '\\\\\\\\')\n")
        new_lines.append("        text = text.replace('@@ONE@@', '\\\\\\\\')\n")
        continue

    if skip and 'return text' in line:
        skip = False
        new_lines.append(line)
        continue

    if not skip:
        new_lines.append(line)

with open('gemini_client.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Robust Two-Pass SLA replacement completed.")
