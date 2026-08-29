# -*- coding: utf-8 -*-
"""
questions.content_xml → 사람이 읽는 문항 발문 텍스트.

[왜]
exam 페이지에서 구글·AI검색이 읽는 텍스트는 AI 분석 문단뿐이고,
정작 시험지는 미리보기 이미지로만 있어 본문으로 안 읽힌다.
문제는 이미 미리보기·무료PDF·강사카페로 전량 무료 공개돼 있으므로
발문을 텍스트로 내보내도 판매 잠식이 없다. (해설은 유일한 판매 근거라 절대 내보내지 않는다)

[핵심]
- plain_text 는 수식이 통째로 빠져 "직선 을 축의 방향으로 만큼…" 같은 조각글이 된다.
  content_xml 에는 <EQUATION><SCRIPT>…</SCRIPT></EQUATION> 가 제자리에 남아 있어 복원이 된다.
- **해설은 <ENDNOTE> 서브트리 안에 있다.** 그 안을 통째로 건너뛰면 발문만 남는다.
  이 규칙이 깨지면 해설이 새어 나가므로, 아래 harvest() 는 ENDNOTE 를 만나면 무조건 반환한다.
- 도형 문제는 그림이 본질이라 텍스트로 옮길 수 없다. 그림이 있는 문항은 발문만으로는
  뜻이 안 통하므로 has_picture 로 표시해 호출부가 판단하게 한다.

사용:
    python scripts/question_text.py            # 표본 출력
    python scripts/question_text.py --audit    # 전량 통계
"""
import re, sys
import xml.etree.ElementTree as ET

sys.path.insert(0, __file__.rsplit('\\', 1)[0].rsplit('/', 1)[0])
from hwp_math import to_text, MathConvertError

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass


class QuestionTextError(Exception):
    pass


# 해설이 들어 있는 곳. 여기 들어가면 안 된다.
SOLUTION_TAGS = {'ENDNOTE', 'FOOTNOTE', 'HEADER', 'FOOTER', 'COMMENT'}
# 그림·도형
PICTURE_TAGS = {'PICTURE', 'DRAWINGOBJECT', 'CONTAINER', 'LINE', 'RECTANGLE',
                'ELLIPSE', 'ARC', 'POLYGON', 'CURVE', 'OLE'}
# 줄바꿈으로 볼 것
BREAK_TAGS = {'P', 'LINESEG', 'TABLE', 'TR'}


def _walk(el, out, flags, depth=0):
    """주의: HML 은 tail 을 쓴다. 본문의 상당 부분이 <EQUATION> 안
    <LINEBREAK>·<TAB> 의 tail 에 들어 있다 — 선택지 표시 ②③⑤ 도 거기 있다.
    EQUATION 에서 바로 반환하면 그 글자들이 통째로 사라진다."""
    tag = el.tag.upper()
    if tag in SOLUTION_TAGS:
        flags['had_solution'] = True             # 해설은 통째로 건너뛴다
    elif tag in PICTURE_TAGS:
        flags['has_picture'] = True
    elif tag == 'EQUATION':
        script = None
        for ch in el:
            if ch.tag.upper() == 'SCRIPT':
                script = ''.join(ch.itertext())
                break
        if script is None:
            script = el.get('data-hml-script') or ''
        flags['equations'] += 1
        # 한글 뒤에 수식이 바로 붙으면 '삼차방정식x³-…' 이 된다 → 앞에만 한 칸 넣는다.
        # 뒤에는 넣지 않는다. 한국어 조사는 붙여 써야 맞다('…+9의 값은?').
        if out and out[-1] and out[-1][-1] not in ' \n([{':
            out.append(' ')
        try:
            out.append(to_text(script))
        except MathConvertError as e:
            flags['failed'].append(str(e))
            out.append('\x00')                   # 실패 표시 — 호출부가 문항을 버린다
        for ch in el:                            # SCRIPT 외 자식의 tail 이 본문이다
            if ch.tag.upper() == 'SCRIPT':
                if ch.tail:
                    out.append(ch.tail)
            else:
                _walk(ch, out, flags, depth + 1)
    else:
        if tag == 'CHAR' and el.text:
            out.append(el.text)
        elif tag == 'TAB':
            out.append(' ')
        if tag in BREAK_TAGS and out and not out[-1].endswith('\n'):
            out.append('\n')
        for ch in el:
            _walk(ch, out, flags, depth + 1)
    if el.tail:                                  # tail 은 이 요소 '뒤' 글자라 항상 안전하다
        out.append(el.tail)


_WS = re.compile(r'[ \t ]+')
_NL = re.compile(r'\n{2,}')
# 문항 앞머리에 붙는 편집용 표식: '②#유리함수그래프 난2' 같은 것
_LEAD_META = re.compile(r'^[①-⑳]?\s*#\S+\s*(난\d)?\s*')
# 선택지 줄 식별용 (통계에만 쓴다). 표시 ②③⑤ 는 EQUATION 안 TAB 의 tail 에 들어 있다.

_CHOICE_LINE = re.compile(r'^\s*[①-⑤]')


def extract(content_xml):
    """반환: {'text', 'has_picture', 'equations', 'failed'}"""
    if not content_xml:
        raise QuestionTextError('content_xml 없음')
    try:
        root = ET.fromstring(content_xml)
    except ET.ParseError:
        try:
            root = ET.fromstring('<ROOT>' + content_xml + '</ROOT>')
        except ET.ParseError as e:
            raise QuestionTextError(f'XML 파싱 실패: {e}')
    out, flags = [], {'has_picture': False, 'had_solution': False,
                      'equations': 0, 'failed': []}
    _walk(root, out, flags)
    txt = ''.join(out)
    txt = _WS.sub(' ', txt)
    txt = _NL.sub('\n', txt)
    txt = '\n'.join(l.strip() for l in txt.split('\n'))
    txt = _LEAD_META.sub('', txt.strip())
    txt = _WS.sub(' ', txt).strip()
    flags['text'] = txt
    return flags


def build(content_xml, min_len=12):
    """텍스트 노출에 쓸 발문. 못 쓰겠으면 QuestionTextError."""
    r = extract(content_xml)
    if '\x00' in r['text']:
        raise QuestionTextError(f"수식 변환 실패 {len(r['failed'])}건")
    if len(r['text']) < min_len:
        raise QuestionTextError(f"발문이 너무 짧음({len(r['text'])}자)")
    return r


# ─────────────────────────── 실행부 ───────────────────────────
def _db():
    import os, requests, urllib3
    urllib3.disable_warnings()
    _o = requests.Session.request
    requests.Session.request = lambda s, *a, **k: _o(s, *a, **{**k, 'verify': False})
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env = {}
    for line in open(os.path.join(root, '.env.local'), encoding='utf-8'):
        m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
        if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    U = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
    H = {'apikey': env['SUPABASE_SERVICE_ROLE_KEY'],
         'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY']}
    return requests, U, H


if __name__ == '__main__':
    requests, U, H = _db()
    n = 400
    for a in sys.argv:
        if a.startswith('--n='): n = int(a.split('=')[1])
    rows, off = [], 0
    while off < n:
        r = requests.get(f'{U}/rest/v1/questions', headers={**H, 'Range': f'{off}-{off+999}'},
                         params=[('select', 'id,content_xml')], timeout=300).json()
        if not isinstance(r, list) or not r: break
        rows += r
        print(f'  … {len(rows):,}개 수신', end='\r')
        if len(r) < 1000: break
        off += 1000
    print(' ' * 30, end='\r')

    if '--audit' in sys.argv:
        import collections
        ok = short = eqfail = xmlfail = pic = 0
        lens = []
        reasons = collections.Counter()
        for q in rows:
            try:
                r = build(q['content_xml'])
                ok += 1; lens.append(len(r['text']))
                if r['has_picture']: pic += 1
            except QuestionTextError as e:
                msg = str(e)
                reasons[re.sub(r'\d+', 'N', msg)[:40]] += 1
                if '수식' in msg: eqfail += 1
                elif '짧' in msg: short += 1
                else: xmlfail += 1
        lens.sort()
        tot = len(rows)
        print(f'문항 {tot:,}개')
        print(f'  발문 확보 {ok:,} ({ok*100/max(tot,1):.1f}%)')
        print(f'    그중 그림 포함 {pic:,} ({pic*100/max(ok,1):.1f}%) ← 발문만으로는 뜻이 안 통할 수 있음')
        print(f'    그림 없는 순수 텍스트 문항 {ok-pic:,} ({(ok-pic)*100/max(tot,1):.1f}%)')
        if lens:
            print(f'  발문 길이  중앙값 {lens[len(lens)//2]}자 · 평균 {sum(lens)//len(lens)}자 '
                  f'· 하위10% {lens[len(lens)//10]}자 · 상위10% {lens[len(lens)*9//10]}자')
        print(f'  제외 {tot-ok:,} (수식실패 {eqfail} · 너무짧음 {short} · XML {xmlfail})')
        for k, v in reasons.most_common(8):
            print(f'      {v:>6,}  {k}')
        sys.exit(0)

    shown = 0
    for q in rows:
        try:
            r = build(q['content_xml'])
        except QuestionTextError as e:
            continue
        print(f"\n[{q['id'][:8]}] 수식 {r['equations']}개 · 그림 {'있음' if r['has_picture'] else '없음'}")
        print('  ' + r['text'][:400])
        shown += 1
        if shown >= 12: break
