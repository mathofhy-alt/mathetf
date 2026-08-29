# -*- coding: utf-8 -*-
"""
한글(HWP) 수식 문법 → 유니코드 평문 / LaTeX 변환기.

[왜 만드는가]
exam 페이지에서 구글·AI검색이 읽을 수 있는 텍스트는 AI 분석 문단뿐이고,
정작 실질 내용인 시험지는 미리보기 이미지로만 있어 본문으로 안 읽힌다.
questions.content_xml 에 수식이 제자리에 보존돼 있으므로
  <EQUATION data-hml-math-id="MATH_0"><SCRIPT>it y = 2 it x + 3</SCRIPT></EQUATION>
SCRIPT 를 사람이 읽는 텍스트로 바꿔 그 자리에 끼우면 발문이 살아난다.

[출력을 두 가지로 두는 이유]
  to_text()  → 'y = 2x + 3'  … 페이지 본문·메타설명용. 사람도 크롤러도 그대로 읽는다.
  to_latex() → 'y = 2x + 3'  … 나중에 KaTeX 로 렌더링하고 싶을 때.
LaTeX 소스를 그대로 본문에 박으면 \\frac{x^{2}}{4} 같은 게 글자로 남아
오히려 저품질 자동생성 텍스트로 보인다. 그래서 기본은 유니코드다.

[실측 기반 설계 — 수식 105,581개]
  길이 중앙값 8자(=변수 한 글자짜리가 절대다수), 90% 지점 39자
  it 29% · ^ 13% · over 9% · _ 8% · 그리스문자 4% · sqrt 3% · left/right 3%
  matrix·sum·int·lim 은 각각 1% 미만

[안전장치]
깨진 수식을 노출하면 구글이 저품질로 보고 색인 제외를 고착시킨다.
그래서 모르는 토큰을 만나면 조용히 넘기지 않고 MathConvertError 를 던진다.
호출부는 그 문항을 통째로 텍스트 노출에서 제외해야 한다.

사용:
    python scripts/hwp_math.py              # 자체 테스트
    python scripts/hwp_math.py --audit      # DB 수식 전량 변환해 성공률 측정
    python scripts/hwp_math.py --audit --n=2000 --samples
"""
import os, re, sys
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass


class MathConvertError(Exception):
    """변환 불가. 호출부는 해당 문항을 텍스트 노출에서 제외한다."""


# ────────────────────────────── 사전 ──────────────────────────────
# (latex, unicode)
GREEK_LOWER = {
    'alpha': (r'\alpha', 'α'), 'beta': (r'\beta', 'β'), 'gamma': (r'\gamma', 'γ'),
    'delta': (r'\delta', 'δ'), 'epsilon': (r'\epsilon', 'ε'), 'varepsilon': (r'\varepsilon', 'ε'),
    'zeta': (r'\zeta', 'ζ'), 'eta': (r'\eta', 'η'), 'theta': (r'\theta', 'θ'),
    'vartheta': (r'\vartheta', 'ϑ'), 'iota': (r'\iota', 'ι'), 'kappa': (r'\kappa', 'κ'),
    'lambda': (r'\lambda', 'λ'), 'mu': (r'\mu', 'μ'), 'nu': (r'\nu', 'ν'),
    'xi': (r'\xi', 'ξ'), 'omicron': ('o', 'ο'), 'pi': (r'\pi', 'π'), 'varpi': (r'\varpi', 'ϖ'),
    'rho': (r'\rho', 'ρ'), 'varrho': (r'\varrho', 'ϱ'), 'sigma': (r'\sigma', 'σ'),
    'varsigma': (r'\varsigma', 'ς'), 'tau': (r'\tau', 'τ'), 'upsilon': (r'\upsilon', 'υ'),
    'phi': (r'\phi', 'φ'), 'varphi': (r'\varphi', 'φ'), 'chi': (r'\chi', 'χ'),
    'psi': (r'\psi', 'ψ'), 'omega': (r'\omega', 'ω'),
}
GREEK_UPPER = {
    'gamma': (r'\Gamma', 'Γ'), 'delta': (r'\Delta', 'Δ'), 'theta': (r'\Theta', 'Θ'),
    'lambda': (r'\Lambda', 'Λ'), 'xi': (r'\Xi', 'Ξ'), 'pi': (r'\Pi', 'Π'),
    'sigma': (r'\Sigma', 'Σ'), 'upsilon': (r'\Upsilon', 'Υ'), 'phi': (r'\Phi', 'Φ'),
    'psi': (r'\Psi', 'Ψ'), 'omega': (r'\Omega', 'Ω'),
    # 대문자가 따로 없는 것은 로마자와 같은 글자를 쓴다
    'alpha': ('A', 'Α'), 'beta': ('B', 'Β'), 'epsilon': ('E', 'Ε'), 'zeta': ('Z', 'Ζ'),
    'eta': ('H', 'Η'), 'iota': ('I', 'Ι'), 'kappa': ('K', 'Κ'), 'mu': ('M', 'Μ'),
    'nu': ('N', 'Ν'), 'omicron': ('O', 'Ο'), 'rho': ('P', 'Ρ'), 'tau': ('T', 'Τ'),
    'chi': ('X', 'Χ'),
}

SYMBOL = {
    'times': (r'\times', '×'), 'div': (r'\div', '÷'), 'cdot': (r'\cdot', '·'),
    'ast': (r'\ast', '∗'), 'star': (r'\star', '⋆'), 'circ': (r'\circ', '∘'),
    'bullet': (r'\bullet', '∙'), 'oplus': (r'\oplus', '⊕'), 'otimes': (r'\otimes', '⊗'),
    'pm': (r'\pm', '±'), 'mp': (r'\mp', '∓'),
    'leq': (r'\leq', '≤'), 'le': (r'\leq', '≤'), 'geq': (r'\geq', '≥'), 'ge': (r'\geq', '≥'),
    'neq': (r'\neq', '≠'), 'ne': (r'\neq', '≠'), 'approx': (r'\approx', '≈'),
    'equiv': (r'\equiv', '≡'), 'sim': (r'\sim', '∼'), 'simeq': (r'\simeq', '≃'),
    'cong': (r'\cong', '≅'), 'propto': (r'\propto', '∝'),
    'll': (r'\ll', '≪'), 'gg': (r'\gg', '≫'), 'doteq': (r'\doteq', '≐'),
    'infty': (r'\infty', '∞'), 'inf': (r'\infty', '∞'), 'partial': (r'\partial', '∂'),
    'nabla': (r'\nabla', '∇'), 'aleph': (r'\aleph', 'ℵ'), 'hbar': (r'\hbar', 'ℏ'),
    'rightarrow': (r'\rightarrow', '→'), 'leftarrow': (r'\leftarrow', '←'),
    'uparrow': (r'\uparrow', '↑'), 'downarrow': (r'\downarrow', '↓'),
    'leftrightarrow': (r'\leftrightarrow', '↔'), 'to': (r'\to', '→'),
    'mapsto': (r'\mapsto', '↦'), 'longrightarrow': (r'\longrightarrow', '⟶'),
    'in': (r'\in', '∈'), 'notin': (r'\notin', '∉'), 'ni': (r'\ni', '∋'),
    'subset': (r'\subset', '⊂'), 'supset': (r'\supset', '⊃'),
    'subseteq': (r'\subseteq', '⊆'), 'supseteq': (r'\supseteq', '⊇'),
    'cap': (r'\cap', '∩'), 'cup': (r'\cup', '∪'), 'emptyset': (r'\emptyset', '∅'),
    'inter': (r'\cap', '∩'), 'union': (r'\cup', '∪'),
    'smallinter': (r'\cap', '∩'), 'smallunion': (r'\cup', '∪'),
    'smallcap': (r'\cap', '∩'), 'smallcup': (r'\cup', '∪'),
    'notsubset': (r'\not\subset', '⊄'), 'notsupset': (r'\not\supset', '⊅'),
    'rarrow': (r'\rightarrow', '→'), 'larrow': (r'\leftarrow', '←'),
    'uarrow': (r'\uparrow', '↑'), 'darrow': (r'\downarrow', '↓'),
    'lrarrow': (r'\leftrightarrow', '↔'),
    'setminus': (r'\setminus', '∖'), 'complement': (r'^{c}', 'ᶜ'),
    'forall': (r'\forall', '∀'), 'exists': (r'\exists', '∃'),
    'land': (r'\land', '∧'), 'lor': (r'\lor', '∨'), 'lnot': (r'\lnot', '¬'),
    'angle': (r'\angle', '∠'), 'triangle': (r'\triangle', '△'),
    'square': (r'\square', '□'), 'bigcirc': (r'\bigcirc', '○'),
    'perp': (r'\perp', '⊥'), 'parallel': (r'\parallel', '∥'),
    'degree': (r'^\circ', '°'),
    'therefore': (r'\therefore', '∴'), 'because': (r'\because', '∵'),
    'cdots': (r'\cdots', '⋯'), 'ldots': (r'\ldots', '…'), 'dots': (r'\dots', '…'),
    'vdots': (r'\vdots', '⋮'), 'ddots': (r'\ddots', '⋱'),
    'prime': ("'", '′'), 'dprime': ("''", '″'),
    'div2': (r'\div', '÷'),
}

# 큰 연산자 (from/to 로 범위를 받는다)
BIGOP = {
    'sum': (r'\sum', '∑'), 'prod': (r'\prod', '∏'), 'int': (r'\int', '∫'),
    'dint': (r'\int', '∫'), 'dsum': (r'\sum', '∑'), 'dprod': (r'\prod', '∏'),
    'oint': (r'\oint', '∮'), 'iint': (r'\iint', '∬'),
    'lim': (r'\lim', 'lim'), 'limsup': (r'\limsup', 'limsup'), 'liminf': (r'\liminf', 'liminf'),
    'bigcap': (r'\bigcap', '⋂'), 'bigcup': (r'\bigcup', '⋃'),
}

FUNCS = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot',
         'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan',
         'log', 'ln', 'exp', 'max', 'min', 'gcd', 'deg', 'det', 'dim', 'mod']

# 단위·약어 — 수식 안에 로마자로 들어오는 것
UNITS = {'cm', 'mm', 'km', 'kg', 'mg', 'ml', 'kl', 'sec', 'min', 'hr',
         'cm2', 'cm3', 'm2', 'm3', 'nCr', 'nPr', 'nHr'}

DROP = {'it', 'rm', 'bf', 'sf', 'tt', 'roman', 'italic', 'bold', 'nothing', 'phantom',
        'mathit', 'mathrm', 'displaystyle', 'textstyle'}

# HWP 수식 예약어 중 아직 처리하지 않는 것.
# 이걸 변수로 흘려보내면 'over' 가 글자 그대로 본문에 박힌다 — 반드시 실패로 잡는다.
# (HWP 는 명령어 대소문자를 가리지 않으므로 소문자로 비교한다)
RESERVED = {
    'over', 'atop', 'above', 'below', 'from', 'to', 'of', 'root', 'sqrt', 'left', 'right',
    'matrix', 'pmatrix', 'bmatrix', 'dmatrix', 'cases', 'pile', 'lpile', 'rpile', 'cpile',
    'eqalign', 'align', 'binom', 'choose', 'brack', 'brace', 'under', 'sub', 'sup',
    'arc', 'big', 'bigg', 'small', 'rem', 'hom', 'ker', 'box', 'rect', 'lg',
    'col', 'row', 'dyad', 'arch', 'overbrace', 'underbrace', 'widetilde', 'stack',
    'hspace', 'vspace', 'smallint', 'limits', 'nolimits', 'buildrel', 'atopwithdelims',
}

ACCENT = {
    'bar': (r'\bar', '̄'), 'overline': (r'\overline', '̄'),
    'hat': (r'\hat', '̂'), 'widehat': (r'\widehat', '̂'),
    'tilde': (r'\tilde', '̃'), 'vec': (r'\vec', '⃗'),
    'dot': (r'\dot', '̇'), 'ddot': (r'\ddot', '̈'),
    'acute': (r'\acute', '́'), 'grave': (r'\grave', '̀'),
    'check': (r'\check', '̌'), 'breve': (r'\breve', '̆'),
    'underline': (r'\underline', '̲'),
}

DELIM = {'(': (r'(', '('), ')': (r')', ')'), '[': (r'[', '['), ']': (r']', ']'),
         '{': (r'\{', '{'), '}': (r'\}', '}'), '|': (r'|', '|'),
         '<': (r'\langle', '⟨'), '>': (r'\rangle', '⟩'),
         '.': ('', ''), 'langle': (r'\langle', '⟨'), 'rangle': (r'\rangle', '⟩'),
         'lfloor': (r'\lfloor', '⌊'), 'rfloor': (r'\rfloor', '⌋'),
         'lceil': (r'\lceil', '⌈'), 'rceil': (r'\rceil', '⌉'),
         'dline': (r'\|', '‖'), 'parallel': (r'\|', '‖'),
         'lbrace': (r'\{', '{'), 'rbrace': (r'\}', '}'),
         'lbracket': (r'[', '['), 'rbracket': (r']', ']'),
         'lpar': (r'(', '('), 'rpar': (r')', ')'), 'none': ('', '')}

MATRIX = {'matrix': 'matrix', 'pmatrix': 'pmatrix', 'bmatrix': 'bmatrix',
          'dmatrix': 'vmatrix', 'cases': 'cases', 'pile': 'matrix', 'lpile': 'matrix',
          'rpile': 'matrix', 'cpile': 'matrix', 'eqalign': 'aligned', 'align': 'aligned'}

# 붙여쓰기 분리에 쓰는 명령어 낱말 집합
CMD_WORDS = (set(DROP) | set(ACCENT) | set(FUNCS) | set(SYMBOL) | set(BIGOP)
             | set(GREEK_LOWER) | set(MATRIX) | set(UNITS)
             | {'sqrt', 'root', 'left', 'right', 'box', 'rect', 'over', 'atop'})
CMD_WORDS = {w.lower() for w in CMD_WORDS}

SUP_CHARS = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
             '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽',
             ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ',
             'e': 'ᵉ', 'k': 'ᵏ', 'm': 'ᵐ', 'x': 'ˣ', 'y': 'ʸ', 'p': 'ᵖ', 't': 'ᵗ',
             'r': 'ʳ', 'T': 'ᵀ', ' ': ''}
SUB_CHARS = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
             '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍',
             ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ',
             'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ',
             'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ', ' ': ''}


# ──────────────────────────── 토크나이저 ────────────────────────────
_MULTI = ['<==>', '<=>', '==>', '<==', '+-', '-+', '<=', '>=', '!=', '<>', '->', '<-',
          '=>', '<-', '==', '~=']

_TOKEN = re.compile(r'''
      (?P<sp>[ \t\r\n]+)
    | (?P<quote>"[^"]*")
    | (?P<word>[A-Za-z][A-Za-z0-9]*)
    | (?P<num>\d+(?:\.\d+)?)
    | (?P<hangul>[^\x00-\x7F]+)
    | (?P<multi>''' + '|'.join(re.escape(m) for m in _MULTI) + r''')
    | (?P<ch>.)
''', re.X)


def _tokenize(s):
    toks, i, n = [], 0, len(s)
    while i < n:
        # 멀티문자 연산자를 단어·숫자보다 먼저 본다
        for m in _MULTI:
            if s.startswith(m, i):
                toks.append(('op', m)); i += len(m); break
        else:
            mo = _TOKEN.match(s, i)
            if not mo:
                raise MathConvertError(f'토큰화 실패: {s[i]!r}')
            i = mo.end()
            kind = mo.lastgroup
            if kind == 'sp':
                continue
            toks.append(('op' if kind in ('ch', 'multi') else kind, mo.group()))
    return toks


def _balance(toks):
    """짝 없는 중괄호를 버리거나 채운다.
    원본에 'alpha^{3}+beta^{3}} over {k' 처럼 여는 괄호가 빠진 것이 실제로 있다.
    중괄호는 평문 출력에 안 보이므로 이렇게 고쳐도 뜻이 바뀌지 않는다.
    단 left{ · right} 의 괄호는 구분자이지 그룹이 아니라 세지 않는다."""
    out, depth, prev = [], 0, ''
    for kind, tok in toks:
        is_delim = prev in ('left', 'right')
        if kind == 'op' and tok == '{' and not is_delim:
            depth += 1
        elif kind == 'op' and tok == '}' and not is_delim:
            if depth == 0:
                prev = tok
                continue                       # 짝 없는 닫는 괄호는 버린다
            depth -= 1
        out.append((kind, tok))
        prev = tok.lower()
    return out + [('op', '}')] * depth


# ──────────────────────────── 파서 ────────────────────────────
# 노드: ('raw', latex, text) | ('seq', [n]) | ('grp', n) | ('frac', n, n)
#       ('sup', n) | ('sub', n) | ('sqrt', n) | ('root', n, n) | ('acc', name, n)
#       ('func', name) | ('bigop', name) | ('mat', kind, [[n]]) | ('txt', s) | ('brk',)

class _Parser:
    def __init__(self, toks):
        self.t = toks; self.i = 0; self.mat = 0

    def peek(self, k=0):
        return self.t[self.i + k] if self.i + k < len(self.t) else None

    def take(self):
        if self.i >= len(self.t):
            raise MathConvertError('수식이 중간에 끊김')
        self.i += 1
        return self.t[self.i - 1]

    # 한 덩어리(그룹 안 또는 최상위).
    # HWP 의 over 는 TeX 의 \over 와 달리 '바로 앞 항 / 바로 뒤 항' 만 묶는다.
    #   {x^{2}} over {4} + {y^{2}} over {9} = 1   →  x²/4 + y²/9 = 1
    # 그룹 전체를 나누는 것으로 잘못 잡으면 (x²)/(4+y²/(9=1)) 같은 헛것이 나온다.
    def seq(self, depth=0):
        if depth > 40:
            raise MathConvertError('중첩이 너무 깊음')
        parts = []
        while True:
            tk = self.peek()
            if tk is None:
                break
            kind, tok = tk
            if kind == 'op' and tok == '}':
                break
            if kind == 'op' and tok in ('&', '#'):
                if self.mat:                     # 행렬 안에서는 열·행 구분자
                    break
                self.take()                      # 밖에서는 그냥 줄바꿈으로 읽는다
                parts.append(('raw', r'\\', ' / ') if tok == '#' else ('raw', r'\ ', ' '))
                continue
            low = tok.lower()
            if kind == 'word' and low in ('over', 'atop'):
                self.take()
                if not parts:
                    raise MathConvertError('분자가 없는 over')
                num = parts.pop()
                den = self.unit(depth + 1)
                parts.append(('frac' if low == 'over' else 'atop', num, den))
                continue
            parts.append(self.unit(depth + 1))
        return ('seq', parts)

    # 한 항 = 원자 + 거기 달라붙는 위·아래 첨자.
    # over 가 앞 '항' 을 가져가야 하므로 x^2 은 반드시 한 덩어리여야 한다.
    def unit(self, depth=0):
        base = self.atom(depth)
        sup = sub = None
        while True:
            nx = self.peek()
            if not (nx and nx[0] == 'op' and nx[1] in ('^', '_')):
                break
            self.take()
            if nx[1] == '^':
                sup = self.atom(depth)
            else:
                sub = self.atom(depth)
        if sup is None and sub is None:
            return base
        return ('script', base, sup, sub)

    def atom(self, depth=0):
        kind, tok = self.take()

        if kind == 'op':
            if tok == '{':
                inner = self.seq(depth)
                nx = self.peek()
                if nx and nx[0] == 'op' and nx[1] == '}':
                    self.take()
                elif nx is not None:
                    raise MathConvertError('중괄호가 안 닫힘')
                # nx is None: 원본에서 닫는 괄호가 빠진 것. 그룹은 평문에 안 보이므로 그냥 닫는다.
                return ('grp', inner)
            if tok in ('^', "'"):
                if tok == "'":
                    return ('raw', "'", '′')
                return ('sup', self.atom(depth))
            if tok == '_':
                return ('sub', self.atom(depth))
            if tok == '+-':
                return ('raw', r'\pm', '±')
            if tok == '-+':
                return ('raw', r'\mp', '∓')
            if tok in ('<=', '=<'):
                return ('raw', r'\leq', '≤')
            if tok in ('>=', '=>'):
                return ('raw', r'\geq', '≥')
            if tok in ('!=', '<>', '~='):
                return ('raw', r'\neq', '≠')
            if tok == '->':
                return ('raw', r'\to', '→')
            if tok == '<-':
                return ('raw', r'\leftarrow', '←')
            if tok in ('<==>', '<=>'):
                return ('raw', r'\Leftrightarrow', '⟺')
            if tok == '==>':
                return ('raw', r'\Rightarrow', '⟹')
            if tok == '<==':
                return ('raw', r'\Leftarrow', '⟸')
            if tok in ('~', '`'):
                return ('raw', r'\ ', ' ')
            if tok == '%':
                return ('raw', r'\%', '%')
            if tok == '$':
                return ('raw', r'\$', '$')
            if tok == '\\':
                # 원본에 LaTeX 를 그대로 쳐 넣은 것: \times, \neq …
                nx = self.peek()
                if nx and nx[0] == 'word':
                    return self.atom(depth)
                raise MathConvertError('역슬래시')
            if tok in '+-=<>/(),.!|:;[]*':
                return ('raw', tok, tok)
            raise MathConvertError(f'모르는 기호: {tok!r}')

        if kind == 'num':
            return ('raw', tok, tok)

        if kind == 'quote':
            return ('txt', tok[1:-1])

        if kind == 'hangul':
            return ('txt', tok)

        # ── word ──
        low = tok.lower()
        if low in DROP:
            nxt = self.peek()
            # {it a-2 rm} 처럼 그룹 끝에 서식 지시자만 남는 경우가 흔하다
            if nxt is None or (nxt[0] == 'op' and nxt[1] in ('}', '&', '#')):
                return ('seq', [])
            return self.atom(depth)

        if low in ('box', 'rect'):               # box{~~㈎~~} — 보기 라벨 테두리
            return self.atom(depth)

        if low in ACCENT:
            return ('acc', low, self.atom(depth))

        if low == 'sqrt':
            return ('sqrt', self.atom(depth))

        if low == 'root':
            idx = self.atom(depth)
            nx = self.peek()
            if nx and nx[0] == 'word' and nx[1].lower() == 'of':
                self.take()
            return ('root', idx, self.atom(depth))

        if low in ('left', 'right'):
            nk, ntok = self.take()
            key = ntok.lower() if nk == 'word' else ntok
            if key not in DELIM:
                raise MathConvertError(f'모르는 괄호: {ntok!r}')
            return ('delim', low, key)

        if low in MATRIX:
            return self.matrix(low, depth)

        if low in BIGOP:
            node, sup, sub = ('bigop', low), None, None
            while True:
                nx = self.peek()
                if not (nx and nx[0] == 'word' and nx[1].lower() in ('from', 'to', 'below', 'above')):
                    break
                w = self.take()[1].lower()
                if w in ('from', 'below'):
                    sub = self.atom(depth)
                else:
                    sup = self.atom(depth)
            return node if sup is None and sub is None else ('script', node, sup, sub)

        if low in FUNCS:
            return ('func', low)

        if tok in GREEK_LOWER and tok.islower():
            return ('raw',) + GREEK_LOWER[tok]
        if low in GREEK_LOWER:
            if low in GREEK_UPPER:
                return ('raw',) + GREEK_UPPER[low]
            return ('raw',) + GREEK_LOWER[low]

        if low in SYMBOL:
            return ('raw',) + SYMBOL[low]

        if low in DELIM and low not in ('parallel',):
            return ('raw',) + DELIM[low]

        if low in UNITS or tok in UNITS:
            return ('txt', tok)

        if low in RESERVED:
            raise MathConvertError(f'미지원 구조: {tok}')

        # 변수. HWP 는 곱을 붙여 쓰므로 4ac·dx 처럼 글자가 이어진다.
        # 다만 무한정 허용하면 처리 못 한 예약어가 본문에 글자로 새어 나가므로
        # 예약어를 먼저 걸러낸 뒤(위) 짧은 글자열과 점 이름(대문자)만 통과시킨다.
        if re.fullmatch(r'[A-Za-z]\d*', tok):
            return ('raw', tok, tok)
        # HWP 는 명령어를 뒤 토큰에 붙여 쓰기도 한다: rmA, barAB, sinA, rmangle, rmoverline.
        # 사전 조회를 모두 끝낸 뒤에만 쪼갠다(italic·iota 같은 낱말을 잘못 자르지 않도록).
        for cut in range(len(tok) - 1, 0, -1):          # 긴 접두어부터
            if tok[:cut].lower() in CMD_WORDS:
                rest = _tokenize(tok[cut:])     # 남은 조각은 다시 토큰화한다 (rm2 의 '2' 는 숫자다)
                self.t[self.i:self.i] = [('word', tok[:cut])] + rest
                return self.atom(depth)

        # 변수 곱을 붙여 쓴 것: 4ac, dx, pA
        if re.fullmatch(r'[A-Za-z]{2,4}\d*', tok):
            return ('raw', tok, tok)

        raise MathConvertError(f'모르는 낱말: {tok}')

    def matrix(self, kind, depth):
        nx = self.peek()
        if not (nx and nx[0] == 'op' and nx[1] == '{'):
            raise MathConvertError(f'{kind} 뒤에 중괄호가 없음')
        self.take()
        rows, row = [], []
        self.mat += 1
        try:
            while True:
                row.append(self.seq(depth + 1))
                nx = self.peek()
                if nx is None:
                    raise MathConvertError(f'{kind} 가 안 닫힘')
                if nx[1] == '&':
                    self.take(); continue
                if nx[1] == '#':
                    self.take(); rows.append(row); row = []; continue
                if nx[1] == '}':
                    self.take(); rows.append(row); break
                raise MathConvertError(f'{kind} 안에서 예상 못 한 토큰: {nx[1]!r}')
        finally:
            self.mat -= 1
        return ('mat', MATRIX[kind], rows)


# ──────────────────────────── 렌더러 ────────────────────────────
def _lat(n):
    k = n[0]
    if k == 'raw':   return n[1]
    if k == 'txt':   return r'\text{' + n[1] + '}'
    if k == 'seq':   return ' '.join(x for x in (_lat(c) for c in n[1]) if x)
    if k == 'grp':   return '{' + _lat(n[1]) + '}'
    if k == 'frac':  return r'\frac{' + _lat(n[1]) + '}{' + _lat(n[2]) + '}'
    if k == 'atop':  return r'{' + _lat(n[1]) + r' \atop ' + _lat(n[2]) + '}'
    if k == 'sup':   return '^{' + _lat(n[1]) + '}'
    if k == 'sub':   return '_{' + _lat(n[1]) + '}'
    if k == 'script':
        s = _lat(n[1])
        if n[3] is not None: s += '_{' + _lat(n[3]) + '}'
        if n[2] is not None: s += '^{' + _lat(n[2]) + '}'
        return s
    if k == 'sqrt':  return r'\sqrt{' + _lat(n[1]) + '}'
    if k == 'root':  return r'\sqrt[' + _lat(n[1]) + ']{' + _lat(n[2]) + '}'
    if k == 'acc':   return ACCENT[n[1]][0] + '{' + _lat(n[2]) + '}'
    if k == 'func':  return '\\' + n[1] if n[1] not in ('gcd', 'mod') else r'\operatorname{%s}' % n[1]
    if k == 'bigop': return BIGOP[n[1]][0]
    if k == 'delim': return ('\\left' if n[1] == 'left' else '\\right') + (DELIM[n[2]][0] or '.')
    if k == 'mat':
        body = r' \\ '.join(' & '.join(_lat(c) for c in row) for row in n[2])
        return r'\begin{%s}%s\end{%s}' % (n[1], body, n[1])
    raise MathConvertError(f'렌더 불가 노드: {k}')


_UNSAFE = set('+-±∓×÷/=<>≤≥≠≡ ,;')


def _is_simple(s):
    """괄호 없이 앞에 놓아도 뜻이 안 흐려지는가 (x², 2a 는 되고 x-3 은 안 된다)"""
    return bool(s) and not (set(s) & _UNSAFE)


def _den_simple(s):
    """분모는 더 깐깐하게. a/2a 는 a/(2a) 인지 (a/2)a 인지 읽는 사람이 갈린다."""
    return len(s) == 1 or s.isdigit() or re.fullmatch(r'√[A-Za-z0-9]', s) is not None


def _small(s, table):
    """지수·아래첨자를 유니코드 작은 글자로. 전부 변환되면 그 문자열, 아니면 None."""
    out = []
    for ch in s:
        if ch not in table:
            return None
        out.append(table[ch])
    return ''.join(out)


def _txt(n):
    k = n[0]
    if k == 'raw':   return n[2]
    if k == 'txt':   return n[1]
    if k == 'seq':
        return _join([_txt(c) for c in n[1]])
    if k == 'grp':   return _txt(n[1])
    if k == 'frac':
        a, b = _txt(n[1]), _txt(n[2])
        if a == '' or b == '':
            raise MathConvertError('분수의 한쪽이 빔')
        return (a if _is_simple(a) else '(' + a + ')') + '/' + (b if _den_simple(b) else '(' + b + ')')
    if k == 'atop':
        return _txt(n[1]) + ' ' + _txt(n[2])
    if k == 'sup':
        s = _txt(n[1])
        u = _small(s, SUP_CHARS)
        return u if u is not None else ('^' + (s if _is_simple(s) else '(' + s + ')'))
    if k == 'sub':
        s = _txt(n[1])
        u = _small(s, SUB_CHARS)
        return u if u is not None else ('_' + (s if _is_simple(s) else '(' + s + ')'))
    if k == 'script':
        # 밑이 비어 있는 것은 오류가 아니다. {}_{5} C _{3} = ₅C₃ (조합 기호의 앞첨자)
        out = _txt(n[1])
        if n[1][0] == 'bigop' and n[1][1].startswith('lim'):
            for lim in (n[3], n[2]):             # lim_(x → 3) 대신 lim(x → 3)
                if lim is not None:
                    out += '(' + _txt(lim) + ')'
            return out
        if n[3] is not None:
            out += _txt(('sub', n[3]))
        if n[2] is not None:
            out += _txt(('sup', n[2]))
        return out
    if k == 'sqrt':
        s = _txt(n[1])
        return '√' + (s if len(s) <= 1 else '(' + s + ')')
    if k == 'root':
        i, s = _txt(n[1]), _txt(n[2])
        pre = _small(i, SUP_CHARS)
        return (pre or ('(' + i + ')')) + '√' + (s if len(s) <= 1 else '(' + s + ')')
    if k == 'acc':
        s = _txt(n[2])
        return s + ACCENT[n[1]][1] if len(s) == 1 else s
    if k == 'func':  return n[1]
    if k == 'bigop': return BIGOP[n[1]][1]
    if k == 'delim': return DELIM[n[2]][1]
    if k == 'mat':
        # cases{`3x-1>5&#`4x-1 LEQ 3x+4&} 처럼 빈 칸을 달고 오는 원본이 흔하다.
        # 빈 칸을 남겨두면 그 자리에 쉼표가 생겨 '3x-1>5, ; 4x-1≤3x+4,' 가 된다.
        rows = [[c for c in (_txt(x) for x in row) if c.strip()] for row in n[2]]
        rows = [r for r in rows if r]
        if not rows:
            raise MathConvertError('빈 행렬')
        if max(len(r) for r in rows) == 1:
            # 한 열짜리는 행렬이 아니라 연립방정식·연립부등식이다.
            # ' ; ' 로 이으면 '3x-1>5, ; 4x-1≤3x+4,' 처럼 원본 쉼표와 겹쳐 읽힌다.
            return ', '.join(r[0].strip().rstrip(',').strip() for r in rows)
        return ' ; '.join(', '.join(r) for r in rows)
    raise MathConvertError(f'렌더 불가 노드: {k}')


_NO_SPACE_BEFORE = set(')]},.!′″°') | set(SUP_CHARS.values()) | set(SUB_CHARS.values())
_NO_SPACE_AFTER = set('([{√')
_OPS = set('+-±∓×÷=<>≤≥≠≡→←↔∈∉⊂⊃∩∪∧∨')
_SIGNS = set('+-±∓')
_OPENERS = set('([{,|')


def _join(parts):
    """한글 문장 안에 자연스럽게 들어가도록 띄어쓰기를 정리한다.
    이항 연산자 좌우는 띄우고, 단항 부호(-b, (-3))는 붙인다."""
    parts = [p for p in parts if p]
    out, prev = '', ''
    for i, p in enumerate(parts):
        if not out:
            out, prev = p, p
            continue
        a, b = out[-1], p[0]
        before_prev = parts[i - 2][-1:] if i >= 2 else ''
        prev_is_sign = (prev in _SIGNS
                        and (before_prev == '' or before_prev in _OPS or before_prev in _OPENERS))
        if b in _NO_SPACE_BEFORE or a in _NO_SPACE_AFTER or prev_is_sign:
            out += p
        elif b in _OPS or a in _OPS:
            out += p if out.endswith(' ') else ' ' + p
        elif ('/' in prev and b.isalnum()) or prev in FUNCS:
            out += ' ' + p                # 1/4 BC · sec θ  — 붙이면 뜻이 흐려진다
        else:
            out += p                      # 2x, ab 처럼 붙여 쓴다
        prev = p
    return out


# ──────────────────────────── 공개 API ────────────────────────────
def _parse(script):
    if script is None:
        raise MathConvertError('script 없음')
    s = str(script).replace(' ', ' ').strip()
    if not s:
        raise MathConvertError('빈 수식')
    if len(s) > 4000:
        raise MathConvertError('너무 긴 수식')
    p = _Parser(_balance(_tokenize(s)))
    parts = [p.seq()]
    while p.peek() is not None:
        kind, tok = p.peek()
        if kind == 'op' and tok == '}':      # 원본의 여는 괄호가 빠진 것
            p.take()
            parts.append(p.seq())
            continue
        raise MathConvertError(f'남는 토큰: {tok!r}')
    return parts[0] if len(parts) == 1 else ('seq', parts)


def to_text(script):
    """HWP 수식 → 사람이 읽는 유니코드 평문. 페이지 본문용."""
    out = _txt(_parse(script)).strip()
    out = re.sub(r'\s{2,}', ' ', out)
    if not out:
        raise MathConvertError('변환 결과가 빔')
    return out


def to_latex(script):
    """HWP 수식 → LaTeX. 나중에 KaTeX 렌더링용."""
    out = re.sub(r'\s{2,}', ' ', _lat(_parse(script))).strip()
    if not out:
        raise MathConvertError('변환 결과가 빔')
    return out


convert = to_text        # 기본은 평문


# ─────────────────────────── 실행부 ───────────────────────────
TESTS = [
    'it y = 2 it x + 3',
    'it x',
    '{x ^ {2}} over {4} + {y ^ {2}} over {9} = 1',
    'sqrt {6 - 2 m ^ {2}}',
    '3 it x^{2} - it y^{2} + 6 = 0',
    'it y = it m it x +- sqrt {6 - 2 m ^ {2}}',
    'a _ {n+1} = a _ n + 3',
    'lim from {n -> infty} {1} over {n}',
    'sum from {k=1} to {n} k ^ 2',
    'f( x ) = { 2 x + 1 } over { x - 3 }',
    'left ( {1} over {2} right )',
    'ANGLE ABC = 90 degree',
    'bar {AB}',
    'sqrt {3}',
    'P ( A CAP B ) = { 1 } over { 6 }',
    'x = { - b +- sqrt {b^2 - 4ac} } over { 2a }',
    'log _ {2} 8 = 3',
    'vec {a} CDOT vec {b}',
    'int _ {0} ^ {1} x dx',
    '30 rm cm',
]

if __name__ == '__main__':
    if '--audit' in sys.argv:
        import requests, urllib3, collections, random
        urllib3.disable_warnings()
        _o = requests.Session.request
        requests.Session.request = lambda self, *a, **k: _o(self, *a, **{**k, 'verify': False})
        ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        env = {}
        for line in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
            m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
            if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
        U = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
        H = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'],
             'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}
        limit = 100000
        for a in sys.argv:
            if a.startswith('--n='): limit = int(a.split('=')[1])
        rows, off = [], 0
        while off < limit:
            r = requests.get(f'{U}/rest/v1/questions',
                             headers={**H, 'Range': f'{off}-{off+999}'},
                             params=[('select', 'id,equation_scripts'),
                                     ('equation_scripts', 'not.is.null')], timeout=300).json()
            if not isinstance(r, list) or not r: break
            rows += r
            print(f'  … 문항 {len(rows):,}개 수신', end='\r')
            if len(r) < 1000: break
            off += 1000
        print(' ' * 40, end='\r')
        ok = fail = 0
        reasons = collections.Counter()
        examples = collections.defaultdict(list)
        good = []
        bad_q = set()
        for x in rows:
            for e in (x.get('equation_scripts') or []):
                try:
                    t = to_text(e); ok += 1
                    if len(good) < 4000: good.append((e, t))
                except MathConvertError as ex:
                    fail += 1
                    key = re.sub(r'[:：].*$', '', str(ex))[:40]
                    reasons[str(ex)[:46]] += 1
                    if len(examples[key]) < 3: examples[key].append(e[:90])
                    bad_q.add(x['id'])
                except Exception as ex:
                    fail += 1
                    reasons[f'[버그] {type(ex).__name__}: {ex}'[:46]] += 1
                    bad_q.add(x['id'])
        tot = ok + fail
        print(f'문항 {len(rows):,}개 · 수식 {tot:,}개')
        print(f'  변환 성공 {ok:,}  ({ok*100/max(tot,1):.2f}%)')
        print(f'  변환 실패 {fail:,}  ({fail*100/max(tot,1):.2f}%)')
        print(f'  실패 수식이 하나라도 있는 문항 {len(bad_q):,}개 / {len(rows):,}개 '
              f'({len(bad_q)*100/max(len(rows),1):.1f}%) ← 텍스트 노출 제외 대상')
        print('\n[실패 사유 상위 25]')
        for k, v in reasons.most_common(25):
            print(f'  {v:>7,}  {k}')
        print('\n[실패 예시]')
        for k, v in list(examples.items())[:12]:
            print(f'  · {k}')
            for s in v: print(f'      {s}')
        if '--samples' in sys.argv:
            print('\n[성공 표본 30개]')
            for e, t in random.sample(good, min(30, len(good))):
                print(f'  {e[:70]}\n      → {t}')
        sys.exit(0)

    print('=== 자체 테스트 ===')
    for src in TESTS:
        try:
            print(f'  {src}\n    평문  {to_text(src)}\n    latex {to_latex(src)}')
        except MathConvertError as e:
            print(f'  {src}\n    ❌ {e}')
