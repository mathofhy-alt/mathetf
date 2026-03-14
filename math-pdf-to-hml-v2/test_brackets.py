import json, re
text = open('debug_raw_stitched_page_1.txt', 'r', encoding='utf-8').read()
pattern = re.compile(r'\{\s*"question"')
starts = [m.start() for m in pattern.finditer(text)]
print('starts:', starts)
for s in starts:
    bc = 0
    inst = False
    esc = False
    e = -1
    for i in range(s, len(text)):
        c = text[i]
        if not inst:
            if c == '{': bc += 1
            elif c == '}':
                bc -= 1
                if bc == 0: e = i; break
            elif c == '"': inst = True
        else:
            if esc: esc = False
            elif c == '\\': esc = True
            elif c == '"': inst = False
    print(f'Start: {s}, End: {e}, text length: {len(text)}')
