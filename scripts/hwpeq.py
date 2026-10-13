# HWP(한글) 수식 문자열 → 읽기 쉬운 한 줄 수식. 문자열 치환이 아니라 토큰화 → 구문 트리 → 출력.
# 분수·근호 범위, 지수·첨자, 연립(cases)·행렬, 한쪽 극한을 구조로 보존한다. 실패하면 None (호출 측이 원본 유지).
import re

GREEK = {'alpha':'α','beta':'β','gamma':'γ','delta':'δ','epsilon':'ε','varepsilon':'ε','zeta':'ζ','eta':'η','theta':'θ','vartheta':'θ',
         'iota':'ι','kappa':'κ','lambda':'λ','mu':'μ','nu':'ν','xi':'ξ','omicron':'ο','pi':'π','rho':'ρ','sigma':'σ','tau':'τ',
         'upsilon':'υ','phi':'φ','varphi':'φ','chi':'χ','psi':'ψ','omega':'ω'}
GREEK_UP = {k.upper(): v.upper() if v not in 'ε' else 'Ε' for k, v in GREEK.items()}
GREEK_UP.update({'GAMMA':'Γ','DELTA':'Δ','THETA':'Θ','LAMBDA':'Λ','XI':'Ξ','PI':'Π','SIGMA':'Σ','PHI':'Φ','PSI':'Ψ','OMEGA':'Ω'})
SYM = {'times':'×','div':'÷','cdot':'·','pm':'±','mp':'∓','leq':'≤','le':'≤','geq':'≥','ge':'≥','neq':'≠','ne':'≠',
       'infty':'∞','inf':'∞','cap':'∩','cup':'∪','subset':'⊂','supset':'⊃','subseteq':'⊆','supseteq':'⊇','in':'∈','notin':'∉',
       'emptyset':'∅','therefore':'∴','because':'∵','angle':'∠','triangle':'△','circ':'∘','deg':'°','cdots':'⋯','ldots':'…',
       'vdots':'⋮','ddots':'⋱','prime':'′','approx':'≈','equiv':'≡','sim':'∼','simeq':'≃','perp':'⊥','bot':'⊥','parallel':'∥',
       'rarrow':'→','larrow':'←','lrarrow':'↔','rightarrow':'→','leftarrow':'←','partial':'∂','nabla':'∇','forall':'∀','exists':'∃',
       'lbrace':'{','rbrace':'}','langle':'⟨','rangle':'⟩','dline':'‖','xor':'⊕','odot':'⊙','oplus':'⊕','otimes':'⊗','star':'☆',
       'smallsum':'Σ','sum':'Σ','prod':'Π','int':'∫','oint':'∮','dint':'∬','tint':'∭','union':'∪','inter':'∩','lnot':'¬','wedge':'∧','vee':'∨',
       'cong':'≅','propto':'∝','ll':'≪','gg':'≫','not':'¬','image':'ℑ','aleph':'ℵ','hbar':'ℏ','LEFTRIGHTARROW':'↔'}
FONT = {'it','rm','bold','IT','RM','BOLD','italic','roman'}
DECO = {'box':'□','bar':'‾','overline':'‾','vec':'→','hat':'^','dot':'˙','ddot':'¨','tilde':'~','under':'_','underline':'_','acute':'´',
        'grave':'`','check':'ˇ','arch':'⌒','dyad':'↔','widehat':'^','widetilde':'~'}
FUNC = {'sin','cos','tan','cot','sec','csc','log','ln','exp','max','min','det','lim','sinh','cosh','tanh','arcsin','arccos','arctan','gcd','lcm','mod','Lim','LIM'}
MATRIX = {'matrix':('',''),'pmatrix':('(',')'),'bmatrix':('[',']'),'dmatrix':('|','|'),'eqalign':('',''),'pile':('',''),'lpile':('',''),'rpile':('','')}
KW_LOWER = {k.lower() for k in list(SYM)+list(FONT)+list(DECO)+list(MATRIX)} | {'over','atop','sqrt','root','of','left','right','cases','from','to','lim'}
SUBS = '₀₁₂₃₄₅₆₇₈₉'
SUBDIG = str.maketrans('0123456789+-=()', '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎')

class Fail(Exception): pass

def tokenize(s):
    toks = []; i = 0; n = len(s)
    while i < n:
        c = s[i]
        if c.isspace(): i += 1; continue
        if c == '"':
            j = s.find('"', i + 1)
            if j < 0: raise Fail('따옴표')
            toks.append(('Q', s[i + 1:j])); i = j + 1; continue
        if s.startswith('->', i): toks.append(('S', '→')); i += 2; continue
        if s.startswith('<->', i): toks.append(('S', '↔')); i += 3; continue
        if s.startswith('+-', i): toks.append(('S', '±')); i += 2; continue
        if s.startswith('-+', i): toks.append(('S', '∓')); i += 2; continue
        if s.startswith('!=', i): toks.append(('S', '≠')); i += 2; continue
        if s.startswith('<=', i): toks.append(('S', '≤')); i += 2; continue
        if s.startswith('>=', i): toks.append(('S', '≥')); i += 2; continue
        if s.startswith('==', i): toks.append(('S', '≡')); i += 2; continue
        if c in '{}^_#&': toks.append((c, c)); i += 1; continue
        if c in '`~': toks.append(('SP', ' ')); i += 1; continue
        if not c.isascii() and (c.isalpha()):
            j = i
            while j < n and not s[j].isascii() and s[j].isalpha(): j += 1
            toks.append(('P', s[i:j])); i = j; continue
        if c.isascii() and c.isalpha():
            j = i
            while j < n and s[j].isascii() and s[j].isalpha(): j += 1
            toks.append(('W', s[i:j])); i = j; continue
        if c.isdigit():
            j = i
            while j < n and (s[j].isdigit() or (s[j] == '.' and j + 1 < n and s[j + 1].isdigit())): j += 1
            toks.append(('N', s[i:j])); i = j; continue
        toks.append(('P', c)); i += 1
    return toks

class P:
    def __init__(s, toks): s.t = toks; s.i = 0
    def peek(s): return s.t[s.i] if s.i < len(s.t) else (None, None)
    def take(s): x = s.peek(); s.i += 1; return x
    def seq(s, stop=('}',), in_grid=False):
        out = []
        while True:
            k, v = s.peek()
            if k is None:
                if '}' in stop and stop != ('EOF',): raise Fail('닫는 괄호 없음')
                return out
            if k in stop: return out
            if in_grid and k in '#&': return out
            if k == 'W' and v.lower() in ('over', 'atop'):
                s.take()
                if not out: raise Fail('분자 없음')
                num = out.pop()
                den = s.atom_scripted()
                if den is None: raise Fail('분모 없음')
                out.append(('frac', num, den)); continue
            a = s.atom_scripted()
            if a is not None: out.append(a)
    def atom_scripted(s):
        a = s.atom()
        while True:
            k, v = s.peek()
            if k in ('^', '_') or (k == 'W' and v in ('from', 'to')):
                s.take()
                b = s.atom()
                while b is None:
                    if s.peek()[0] is None: raise Fail('첨자 없음')
                    b = s.atom()
                if a is None: a = ('txt', '')
                a = ('sup' if k == '^' or v == 'to' else 'sub', a, b)
            else: return a
    def grid(s):
        k, v = s.take()
        if k != '{': raise Fail('격자 { 없음')
        rows = []; row = []
        while True:
            cell = s.seq(stop=('}',), in_grid=True)
            row.append(cell)
            k, v = s.take()
            if k == '&': continue
            if k == '#': rows.append(row); row = []; continue
            if k == '}': rows.append(row); return rows
            raise Fail('격자 끝 없음')
    def atom(s):
        k, v = s.take()
        if k is None: raise Fail('끝')
        if k == '{': g = s.seq(); s.take(); return ('grp', g)
        if k == '}': raise Fail('짝 없는 }')
        if k in '#&': return ('txt', '; ' if k == '#' else ' ')
        if k in '^_': raise Fail('밑 없는 첨자')
        if k == 'Q': return ('txt', v)
        if k in ('S', 'P', 'N'): return ('txt', v)
        if k == 'SP': return ('txt', ' ')
        w = v; wl = v.lower()
        if w in FONT: return None
        if wl == 'sqrt': return ('sqrt', s.need())
        if wl == 'root':
            n = s.need(); k2, v2 = s.take()
            if not (k2 == 'W' and v2.lower() == 'of'): raise Fail('root of 없음')
            return ('root', n, s.need())
        if wl in DECO: return ('deco', DECO[wl], s.need())
        if wl == 'cases': return ('cases', s.grid())
        if wl in MATRIX: return ('mat', MATRIX[wl], s.grid())
        if wl in ('left', 'right'):
            k2, v2 = s.take()
            if k2 is None: raise Fail('left/right 뒤 없음')
            if k2 == 'W' and v2.lower() in SYM: return ('txt', SYM[v2.lower()])
            if k2 == 'P' and v2 == '.': return ('txt', '')
            if k2 in ('{', '}'): return ('txt', v2)
            return ('txt', v2)
        if w in GREEK: return ('txt', GREEK[w])
        if w in GREEK_UP: return ('txt', GREEK_UP[w])
        if w[:1].isupper() and w[1:].islower() and wl in GREEK: return ('txt', GREEK[wl].upper())
        if wl in SYM:
            return ('txt', SYM[wl])
        if wl in ('lim',): return ('func', 'lim')
        return ('word', w)
    def need(s):
        a = s.atom()
        while a is None: a = s.atom()
        return a

ALNUM = re.compile(r'[0-9A-Za-z]')
def simple(x):
    return bool(re.fullmatch(r'[0-9.]+|[A-Za-zα-ωΑ-Ω]′*[₀-₉]*|∞|π|[A-Za-z]+′*\([^()]*\)|‾[A-Za-z]+[₀-₉]*', x))
def wrap(node):
    r = render(node)
    if node[0] == 'grp' and len(node[1]) == 1: node = node[1][0]
    if simple(r) or (node[0] in ('sqrt', 'root')) or (r.startswith('(') and r.endswith(')') and balanced_outer(r)): return r
    return '(' + r + ')'
def balanced_outer(r):
    d = 0
    for i, c in enumerate(r):
        if c == '(': d += 1
        elif c == ')':
            d -= 1
            if d == 0 and i != len(r) - 1: return False
    return d == 0
def join(parts):
    out = ''
    for p in parts:
        if not p: continue
        if out and p[0].isalnum() and p[0] not in SUBS and (re.search(r'(?:^|[^A-Za-z])(sin|cos|tan|cot|sec|csc|log|ln|lim|max|min|exp|det)$', out)):
            out += ' '
        elif out and out[-1].isalnum() and out[-1] not in SUBS and re.match(r'(sin|cos|tan|cot|sec|csc|log|ln|lim|max|min|exp|det)(?![A-Za-z])', p):
            out += ' '
        out += p
    return out
def render_seq(nodes):
    """분수 바로 앞뒤에 다른 항이 붙어 있으면(곱·함수 인자) 분수 전체를 괄호로 — √3/3a 같은 모호함 방지."""
    rs = [render(x) for x in nodes]
    for i, x in enumerate(nodes):
        if x[0] != 'frac': continue
        prev = next((r for r in reversed(rs[:i]) if r.strip()), '') if i else ''
        prev_adj = bool(rs[i - 1]) and not rs[i - 1].endswith(' ') if i else False
        nxt = rs[i + 1] if i + 1 < len(rs) else ''
        glue_prev = i > 0 and rs[i - 1] and (rs[i - 1][-1].isalnum() or rs[i - 1][-1] in ")′°")
        func_prev = bool(re.search(r'(sin|cos|tan|cot|sec|csc|log|ln)\s*$', ''.join(rs[:i])))
        glue_next = bool(nxt) and (nxt[0].isalnum() or nxt[0] in '(√π|{[‾∫Σ△∠' or nxt[0] in 'αβγδθλμσωΠΣ')
        if glue_prev or func_prev or glue_next: rs[i] = '(' + rs[i] + ')'
    for i, x in enumerate(nodes):   # 첨자·지수(괄호 없이 끝난 것) 바로 뒤에 글자가 붙으면 띄운다 — ∫₀^2 4t, A_k H_k
        if x[0] in ('sup', 'sub') and not (x[0] == 'sub' and render(x[1]) == '') and i + 1 < len(rs) and rs[i] and rs[i + 1][:1].isalnum() and rs[i + 1][:1] not in SUBS                 and (rs[i][-1].isalnum() or rs[i][-1] in '′'):
            rs[i] += ' '
    return join(rs)
def swrap(node):
    r = render(node).strip()
    if re.fullmatch(r"[0-9.]+|[A-Za-zα-ωΑ-Ω]′*|[CPHT]|∞|°", r): return r
    return '(' + r + ')' if not (r.startswith('(') and r.endswith(')') and balanced_outer(r)) else r
def render(n):
    t = n[0]
    if t == 'txt': return n[1]
    if t == 'word': return n[1]
    if t == 'func': return n[1]
    if t == 'grp': return render_seq(n[1])
    if t == 'frac': return wrap(n[1]) + '/' + wrap(n[2])
    if t == 'sqrt': return '√' + wrap(n[1])
    if t == 'root': return '√[' + render(n[1]) + ']' + wrap(n[2])
    if t == 'deco': return n[1] + wrap(n[2])
    if t == 'sup':
        e = render(n[2])
        if e in ('∘', 'circ'): return render(n[1]) + '°'
        return render(n[1]) + '^' + swrap(n[2])
    if t == 'sub':
        sb = render(n[2]); b = render(n[1])
        if re.fullmatch(r'[0-9]+', sb): return b + sb.translate(SUBDIG)
        return b + '_' + swrap(n[2])
    if t == 'cases':
        rows = []
        for row in n[1]:
            cells = [render_seq(c).strip() for c in row]
            cond = ', '.join(c for c in cells[1:] if c)
            if cond and not (cond.startswith('(') and cond.endswith(')') and balanced_outer(cond)): cond = '(' + cond + ')'
            rows.append(cells[0] + (' ' + cond if cond else ''))
        return '{' + '; '.join(rows) + '}'
    if t == 'mat':
        (l, r), rows = n[1], n[2]
        return l + '; '.join(' '.join(render_seq(c).strip() for c in row) for row in rows) + r
    raise Fail(t)

def content_alnum_in(toks):
    """입력에서 '내용'인 영숫자만(명령어·글꼴·그리스 이름 제외)."""
    out = []
    for k, v in toks:
        if k == 'N': out.append(v.replace('.', ''))
        elif k == 'Q': out.append(''.join(ALNUM.findall(v)))
        elif k == 'W':
            wl = v.lower()
            if wl in FUNC: out.append(v); continue
            if v in FONT or wl in KW_LOWER or v in GREEK or v in GREEK_UP or wl in GREEK: continue
            out.append(v)
    return ''.join(out)
def content_alnum_out(s):
    s = s.translate(str.maketrans('₀₁₂₃₄₅₆₇₈₉', '0123456789'))
    return ''.join(ALNUM.findall(s))

def convert(src):
    """성공하면 (변환문자열, None), 실패하면 (None, 사유)."""
    try:
        toks = tokenize(src)
        p = P(toks); tree = p.seq(stop=('EOF',))
        if p.i < len(toks): raise Fail('남은 토큰')
        out = re.sub(r'\s+', ' ', render_seq(tree)).strip()
    except Fail as e: return None, str(e)
    except RecursionError: return None, '재귀'
    a, b = content_alnum_in(toks), content_alnum_out(out)
    if a != b: return None, f'내용 불일치 {a[:40]} / {b[:40]}'
    left = [w for w in re.findall(r'[A-Za-z]+', out) if w.lower() in (KW_LOWER - {'in'} - set(FUNC)) and w not in ('C', 'P', 'H')]
    if left: return None, f'명령어 남음 {left[:3]}'
    return out, None
