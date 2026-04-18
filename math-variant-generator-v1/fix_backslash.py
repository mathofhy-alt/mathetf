import re

with open('gemini_client.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
skip = False
for i, line in enumerate(lines):
    if 'latex_cmds = [' in line:
        skip = True
        new_lines.append("        latex_cmds = [\n")
        new_lines.append("            'rightarrow', 'Rightarrow', 'leftarrow', 'Leftarrow', \n")
        new_lines.append("            'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',\n")
        new_lines.append("            'Alpha', 'Beta', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',\n")
        new_lines.append("            'times', 'div', 'frac', 'neq', 'le', 'ge', 'leq', 'geq', 'infty', 'sqrt', 'log', 'ln', 'lim', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot',\n")
        new_lines.append("            'int', 'oint', 'sum', 'prod', 'cdot', 'ldots', 'cdots', 'quad', 'qquad',\n")
        new_lines.append("            'bar', 'hat', 'vec', 'tilde', 'overline', 'underline', 'begin', 'end', 'pmatrix', 'bmatrix', 'vmatrix', 'matrix', 'cases',\n")
        new_lines.append("            'mathbf', 'mathrm', 'mathbb', 'mathcal', 'mathit', 'text', 'left', 'right', 'lbrace', 'rbrace', 'langle', 'rangle', 'equiv', 'approx', 'propto', 'pm', 'mp', 'subset', 'supset', 'subseteq', 'supseteq', 'in', 'notin', 'cap', 'cup'\n")
        new_lines.append("        ]\n")
        new_lines.append("        text = text.replace('\\\\\\\\', '@@BR@@')\n")
        new_lines.append("        for cmd in latex_cmds:\n")
        new_lines.append("            text = text.replace('@@BR@@' + cmd, '\\\\\\\\' + cmd)\n")
        new_lines.append("            text = text.replace('\\\\' + cmd, '\\\\\\\\' + cmd)\n")
        new_lines.append("        text = text.replace('@@BR@@', '\\\\\\\\\\\\\\\\')\n")
        continue

    if skip and 'return text' in line:
        skip = False
        new_lines.append("        return text\n")
        continue

    if not skip:
        new_lines.append(line)

with open('gemini_client.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Backslash row-break protection logic implemented.")
