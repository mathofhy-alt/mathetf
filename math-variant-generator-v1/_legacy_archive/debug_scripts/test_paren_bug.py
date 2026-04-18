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
    result = []
    i = 0
    while i < len(s):
        if s[i] == '\\\\': 
            result.append(s[i])
            i+=1
        elif s[i] == '{':
            content, i = _extract_braced(s, i)
            inner = _latex_to_hwp(content)
            result.append(f'{{{inner}}}')
        elif s[i] == '^':
            result.append('^')
            i += 1
            if i < len(s) and s[i] == '{':
                content, i = _extract_braced(s, i)
                result.append(f'{{{_latex_to_hwp(content)}}}')
        elif s[i] == '_':
            result.append('_')
            i += 1
            if i < len(s) and s[i] == '{':
                content, i = _extract_braced(s, i)
                result.append(f'{{{_latex_to_hwp(content)}}}')
        elif s[i] == '(':
            result.append('LEFT \(')
            i += 1
        elif s[i] == ')':
            result.append('RIGHT \)')
            i += 1
        else:
            result.append(s[i])
            i += 1
    return "".join(result)

import re
def _clean_hwp(s):
    s = re.sub(r'_\\{([^\\{}]+?)\\s*\\(\\s*([^\\{}]+?)\\s*\\)\\s*\\}', r'_\\1 LEFT ( \\2 RIGHT )', s)
    return s

print('A:', _latex_to_hwp('f(x^{2})'))
print('B:', _latex_to_hwp('f(x^2)'))
print('C:', _clean_hwp(_latex_to_hwp('f(x^{2})')))
