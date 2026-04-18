
def _extract_braced(s, pos):
    if pos >= len(s) or s[pos] != '{': return '', pos
    depth = 0
    for i in range(pos, len(s)):
        if s[i] == '{': depth += 1
        elif s[i] == '}':
            depth -= 1
            if depth == 0: return s[pos+1:i], i+1
    return s[pos+1:], len(s)

def _latex_to_hwp(s):
    if not s: return s
    result = []; i = 0
    while i < len(s):
        if s[i] == '\\':
            j = i + 1
            if j < len(s) and s[j].isalpha():
                while j < len(s) and s[j].isalpha(): j += 1
                cmd = s[i+1:j]; i = j
                while i < len(s) and s[i] == ' ': i += 1
                if cmd == 'frac':
                    num, i = _extract_braced(s, i)
                    while i < len(s) and s[i] == ' ': i += 1
                    den, i = _extract_braced(s, i)
                    result.append(f'{{ {_latex_to_hwp(num)} }} over {{ {_latex_to_hwp(den)} }}')
                elif cmd in ('bar','hat','tilde','vec','dot','ddot'):
                    arg, i = _extract_braced(s, i)
                    result.append(f'{cmd}{{{_latex_to_hwp(arg)}}}')
                elif cmd == 'overline':
                    arg, i = _extract_braced(s, i)
                    result.append(f'overline {{{_latex_to_hwp(arg)}}}')
                elif cmd == 'underline':
                    arg, i = _extract_braced(s, i)
                    result.append(f'underline {{{_latex_to_hwp(arg)}}}')
                elif cmd == 'sqrt':
                    if i < len(s) and s[i] == '[':
                        end = s.index(']', i); n = s[i+1:end]; i = end+1
                        arg, i = _extract_braced(s, i)
                        result.append(f' root {{{n}}} of {{{_latex_to_hwp(arg)}}}')
                    else:
                        arg, i = _extract_braced(s, i)
                        result.append(f' sqrt {{{_latex_to_hwp(arg)}}}')
                elif cmd == 'left': result.append(' LEFT ')
                elif cmd == 'right': result.append(' RIGHT ')
                elif cmd in ('lim','log','ln','sin','cos','tan','sec','csc','cot','max','min','sup'):
                    result.append(f' {cmd} ')
                elif cmd == 'infty': result.append(' inf ')
                elif cmd == 'pm': result.append(' +- ')
                elif cmd == 'mp': result.append(' -+ ')
                elif cmd == 'cdot': result.append(' CDOT ')
                elif cmd == 'times': result.append(' TIMES ')
                elif cmd == 'div': result.append(' DIV ')
                elif cmd in ('leq','le'): result.append(' le ')
                elif cmd in ('geq','ge'): result.append(' ge ')
                elif cmd in ('neq','ne'): result.append(' != ')
                elif cmd in ('to','rightarrow'): result.append(' -> ')
                elif cmd == 'leftarrow': result.append(' <- ')
                elif cmd == 'Rightarrow': result.append(' => ')
                elif cmd == 'leftrightarrow': result.append(' <-> ')
                elif cmd == 'quad': result.append(' quad ')
                elif cmd == 'qquad': result.append(' quad quad ')
                elif cmd in ('ldots','cdots','dots'): result.append('...')
                elif cmd in ('sum','prod','int','partial','nabla'): result.append(f' {cmd} ')
                elif cmd in ('in','notin','subset','cup','cap','emptyset'): result.append(f' {cmd} ')
                elif cmd == 'text':
                    arg, i = _extract_braced(s, i); result.append(arg)
                elif cmd in ('begin','end'):
                    env, i = _extract_braced(s, i)
                elif cmd == 'not': result.append('not ')
                else:
                    result.append(' ' + cmd + ' ')  # 그리스 문자 등 - 앞뒤 공백
            else:
                if j < len(s):
                    c = s[j]
                    if c in '([': result.append(' LEFT' + c + ' ')
                    elif c in ')]': result.append(' RIGHT' + c + ' ')
                    else: result.append(c)
                    i = j+1
                else: i = j
        elif s[i] == '{':
            content, i = _extract_braced(s, i)
            result.append('{' + _latex_to_hwp(content) + '}')
        elif s[i] == '^':
            result.append('^'); i += 1
            if i < len(s) and s[i] == '{':
                content, i = _extract_braced(s, i)
                result.append('{' + _latex_to_hwp(content) + '}')
        elif s[i] == '_':
            result.append('_'); i += 1
            if i < len(s) and s[i] == '{':
                content, i = _extract_braced(s, i)
                result.append('{' + _latex_to_hwp(content) + '}')
        else:
            result.append(s[i]); i += 1
    import re
    return re.sub(r' +', ' ', ''.join(result)).strip()

tests = [
    (r'\frac{\frac{1}{2}}{3}',               '{ {1} over {2} } over {3}'),
    (r'\frac{\bar{\alpha}}{5}',              '{bar{alpha}} over {5}'),
    (r'\overline{\alpha\beta}',              'overline {alpha beta}'),
    (r'\left(\frac{5\beta}{\bar{\alpha}}\right)', 'LEFT'),
    (r'\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}', '{-b +- sqrt {b^2 - 4ac}} over {2a}'),
    (r'\alpha\bar{\alpha} = 4^2 + 3^2 = 25', 'alpha bar{alpha}'),
]

print("=" * 60)
for inp, expected_substr in tests:
    out = _latex_to_hwp(inp)
    ok = expected_substr.replace(' ','') in out.replace(' ','')
    print(f"[{'OK' if ok else 'FAIL'}] IN : {inp}")
    print(f"       OUT: {out}")
    print()
