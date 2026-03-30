import re

def find_matching_brace(text: str, start_index: int) -> int:
    depth = 0
    for i in range(start_index, len(text)):
        if text[i] == '{': depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0: return i
    return -1

def parse_latex(latex: str) -> str:
    i = 0
    output = []
    n = len(latex)
    
    replace_map = {
        'alpha': 'alpha', 'beta': 'beta', 'gamma': 'gamma', 'delta': 'delta', 'epsilon': 'epsilon', 'zeta': 'zeta', 'eta': 'eta', 'theta': 'theta', 'iota': 'iota', 'kappa': 'kappa', 'lambda': 'lambda', 'mu': 'mu', 'nu': 'nu', 'xi': 'xi', 'pi': 'pi', 'rho': 'rho', 'sigma': 'sigma', 'tau': 'tau', 'upsilon': 'upsilon', 'phi': 'phi', 'chi': 'chi', 'psi': 'psi', 'omega': 'omega',
        'Alpha': 'Alpha', 'Beta': 'Beta', 'Gamma': 'Gamma', 'Delta': 'Delta', 'Theta': 'Theta', 'Lambda': 'Lambda', 'Xi': 'Xi', 'Pi': 'Pi', 'Sigma': 'Sigma', 'Phi': 'Phi', 'Psi': 'Psi', 'Omega': 'Omega',
        'infty': 'inf', 'cdot': 'cdot', 'times': 'TIMES', 'div': 'DIVIDE', 'le': 'le', 'ge': 'ge',
        'leq': 'le', 'geq': 'ge', 'neq': '!=', 'pm': '+-', 'mp': '-+',
        'leftarrow': 'leftarrow', 'rightarrow': 'rightarrow', 'to': 'rightarrow', 'Rightarrow': 'Rightarrow', 'Leftarrow': 'Leftarrow',
        'therefore': 'therefore', 'because': 'because', 'sim': 'sim', 'simeq': 'simeq',
        'equiv': 'equiv', 'approx': 'approx', 'propto': 'propto',
        'sin': 'sin', 'cos': 'cos', 'tan': 'tan', 'sec': 'sec', 'csc': 'csc', 'cot': 'cot',
        'log': 'log', 'ln': 'ln', 'lim': 'lim', 'max': 'max', 'min': 'min',
        'sum': 'sum', 'prod': 'prod', 'int': 'int', 'iint': 'iint', 'oint': 'oint',
        'forall': 'forall', 'exists': 'exists', 'nabla': 'nabla', 'partial': 'partial',
        'subset': 'subset', 'supset': 'supset', 'cup': 'cup', 'cap': 'cap', 'subseteq': 'subseteq', 'supseteq': 'supseteq',
        'in': 'in', 'notin': 'notin', 'emptyset': 'emptyset',
        'triangle': 'triangle', 'angle': 'angle',
        'left': 'left', 'right': 'right'
    }

    while i < n:
        if latex[i:i+5] == r'\frac':
            i += 5
            while i < n and latex[i] in ' \t\n\r': i += 1
            if i < n and latex[i] == '{':
                close1 = find_matching_brace(latex, i)
                if close1 != -1:
                    A = latex[i+1:close1]
                    i = close1 + 1
                    while i < n and latex[i] in ' \t\n\r': i += 1
                    if i < n and latex[i] == '{':
                        close2 = find_matching_brace(latex, i)
                        if close2 != -1:
                            B = latex[i+1:close2]
                            i = close2 + 1
                            parsed_A = parse_latex(A)
                            parsed_B = parse_latex(B)
                            output.append(f"{{{parsed_A}}} over {{{parsed_B}}}")
                            continue
            output.append(r'\frac')
            
        elif latex[i:i+6] == r'\begin':
            i += 6
            while i < n and latex[i] in ' \t\n\r': i += 1
            if i < n and latex[i] == '{':
                close1 = find_matching_brace(latex, i)
                if close1 != -1:
                    env = latex[i+1:close1]
                    i = close1 + 1
                    end_str = r'\end{' + env + '}'
                    end_idx = latex.find(end_str, i)
                    if end_idx != -1:
                        inner = latex[i:end_idx]
                        i = end_idx + len(end_str)
                        parsed_inner = parse_latex(inner)
                        parsed_inner = parsed_inner.replace(r'\\', '#').replace('&', '&')
                        if env == 'cases': output.append(f"cases {{{parsed_inner}}}")
                        elif 'matrix' in env: output.append(f"{env} {{{parsed_inner}}}")
                        elif env == 'array': output.append(f"matrix {{{parsed_inner}}}")
                        elif env == 'align' or env == 'align*': output.append(f"matrix {{{parsed_inner}}}")
                        else: output.append(parsed_inner)
                        continue
            output.append(r'\begin')

        elif latex[i:i+5] == r'\sqrt':
            i += 5
            while i < n and latex[i] in ' \t\n\r': i += 1
            if i < n and latex[i] == '[':
                close_bracket = latex.find(']', i)
                if close_bracket != -1:
                    N_root = latex[i+1:close_bracket]
                    i = close_bracket + 1
                    while i < n and latex[i] in ' \t\n\r': i += 1
                    if i < n and latex[i] == '{':
                        close1 = find_matching_brace(latex, i)
                        if close1 != -1:
                            A = latex[i+1:close1]
                            i = close1 + 1
                            parsed_A = parse_latex(A)
                            parsed_n = parse_latex(N_root)
                            output.append(f"root {{{parsed_n}}} {{{parsed_A}}}")
                            continue
            elif i < n and latex[i] == '{':
                close1 = find_matching_brace(latex, i)
                if close1 != -1:
                    A = latex[i+1:close1]
                    i = close1 + 1
                    parsed_A = parse_latex(A)
                    output.append(f"sqrt {{{parsed_A}}}")
                    continue
            output.append(r'\sqrt')

        elif latex[i:i+6] == r'\binom':
            i += 6
            while i < n and latex[i] in ' \t\n\r': i += 1
            if i < n and latex[i] == '{':
                close1 = find_matching_brace(latex, i)
                if close1 != -1:
                    A = latex[i+1:close1]
                    i = close1 + 1
                    while i < n and latex[i] in ' \t\n\r': i += 1
                    if i < n and latex[i] == '{':
                        close2 = find_matching_brace(latex, i)
                        if close2 != -1:
                            B = latex[i+1:close2]
                            i = close2 + 1
                            parsed_A = parse_latex(A)
                            parsed_B = parse_latex(B)
                            output.append(f"binom {{{parsed_A}}} {{{parsed_B}}}")
                            continue
            output.append(r'\binom')

        elif latex[i] == '\\':
            if i + 1 < n and latex[i+1] in '{}%_&$# \\':
                if latex[i+1] == '{': output.append('{')
                elif latex[i+1] == '}': output.append('}')
                elif latex[i+1] == ' ': output.append('~')
                elif latex[i+1] == '\\': output.append('#')
                else: output.append(latex[i+1])
                i += 2
                continue
            
            j = i + 1
            while j < n and latex[j].isalpha(): j += 1
            cmd = latex[i+1:j]
            
            if cmd in replace_map:
                if cmd in ['overline', 'underline', 'vec', 'hat', 'dot']:
                    i = j
                    while i < n and latex[i] in ' \t\n\r': i += 1
                    if i < n and latex[i] == '{':
                        close_pos = find_matching_brace(latex, i)
                        if close_pos != -1:
                            inner = latex[i+1:close_pos]
                            parsed_inner = parse_latex(inner)
                            output.append(f" {replace_map[cmd]} {{{parsed_inner}}} ")
                            i = close_pos + 1
                            continue
                output.append(" " + replace_map[cmd] + " ")
            else:
                if cmd in ['quad', 'qquad', '!', ',', ':', ';']: output.append("  ")
                elif cmd == 'text' or cmd == 'mathrm':
                    i = j
                    while i < n and latex[i] in ' \t\n\r': i += 1
                    if i < n and latex[i] == '{':
                        close_pos = find_matching_brace(latex, i)
                        if close_pos != -1:
                            inner = latex[i+1:close_pos]
                            output.append(f' "{inner}" ')
                            i = close_pos + 1
                            continue
                elif cmd == 'mathbf':
                    i = j
                    while i < n and latex[i] in ' \t\n\r': i += 1
                    if i < n and latex[i] == '{':
                        close_pos = find_matching_brace(latex, i)
                        if close_pos != -1:
                            inner = latex[i+1:close_pos]
                            output.append(f' bold {{{parse_latex(inner)}}} ')
                            i = close_pos + 1
                            continue
                elif not cmd:
                    if j < n:
                        output.append(latex[j])
                        j += 1
            i = j
            
        elif latex[i] in ['_', '^']:
            cmd = latex[i]
            output.append(cmd)
            i += 1
            while i < n and latex[i] in ' \t\n\r':
                i += 1
            if i < n and latex[i].isalnum():
                output.append(f"{{{latex[i]}}}")
                i += 1
        else:
            output.append(latex[i])
            i += 1

    result = "".join(output)
    result = re.sub(r'\s+', ' ', result).strip()
    return result

def latex_to_hwp(latex_code: str) -> str:
    # 1. 태그 벗기기 (프롬프트에서 $$...$$ 또는 \\[...\\] 요구)
    clean = re.sub(r'^\$\$(.*?)\$\$$', r'\1', latex_code.strip(), flags=re.DOTALL)
    clean = re.sub(r'^\\\[(.*?)\\\]$', r'\1', clean.strip(), flags=re.DOTALL)
    
    # 2. 파서를 이용해 트리 순회 번역
    hwp_eq = parse_latex(clean)
    
    # 3. 레이아웃 버그 해결 (후처리)
    hwp_eq = re.sub(r'\s+([\^_])', r'\1', hwp_eq)  # x ^{2} 처럼 엉뚱하게 떨어진 지수 붙이기
    hwp_eq = hwp_eq.replace('})', '} )').replace('^)', '^ )').replace('_)', '_ )') # x_{2}) 괄호 마름 현상 방지 보정
    
    return hwp_eq
