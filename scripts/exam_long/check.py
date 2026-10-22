"""장문 분석글 검사: python check.py <exam_id ...>  — 숫자를 자료(facts)와 대조하고 금지 표현을 잡는다."""
import json, os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.abspath(__file__))


def body(a):
    parts = list(a['summary'])
    for s in a['sections']:
        parts += s.get('paragraphs', []) + s.get('list', []) + [i['text'] for i in s.get('items', [])]
        if s.get('table'): parts += [' '.join(r) for r in s['table']['rows']]
    parts += [f['q'] + ' ' + f['a'] for f in a['faq']]
    return '\n'.join(parts)


def nums(s):
    return [int(x) for x in re.findall(r'\d+', s)]


def check(eid, outdir='out'):
    d = json.load(open(os.path.join(ROOT, 'data', eid + '.json'), encoding='utf-8'))
    a = json.load(open(os.path.join(ROOT, outdir, eid + '.json'), encoding='utf-8'))
    f, err = d['facts'], []
    for k in ('title', 'reviewedAt', 'summary', 'sections', 'faq', 'scope'):
        if k not in a: err.append(f'키 없음: {k}')
    if err: return err
    txt = body(a)
    # 작년 비교 섹션은 따로 대조한다(올해 숫자 검사에서 빼야 오탐이 안 난다)
    cmp_secs = [s for s in a['sections'] if s['heading'].startswith('작년 시험과 비교')]
    prev = d.get('previous_year')
    if prev and not cmp_secs: err.append('작년 자료가 있는데 "작년 시험과 비교" 섹션 없음')
    if not prev and cmp_secs: err.append('작년 자료가 없는데 비교 섹션을 씀')
    if prev and cmp_secs:
        t = cmp_secs[0].get('table')
        if not t: err.append('작년 비교 표 없음')
        else:
            want = {'총 문항': (prev['total'], f['total']), '서술·단답': (len(prev['written']), len(f['written'])),
                    '쉬움': (len(prev['bands']['쉬움']), len(f['bands']['쉬움'])), '보통': (len(prev['bands']['보통']), len(f['bands']['보통'])),
                    '어려움': (len(prev['bands']['어려움']), len(f['bands']['어려움']))}
            for r in t['rows']:
                k = r[0].strip()
                if k in want:
                    got = (nums(r[1])[:1], nums(r[2])[:1])
                    if got != ([want[k][0]], [want[k][1]]): err.append(f'작년 비교 표 {k}: {r[1]} / {r[2]} ≠ {want[k]}')
            for k in want:
                if not any(r[0].strip() == k for r in t['rows']): err.append(f'작년 비교 표에 "{k}" 행 없음')
    # 같은 지역 비교(10/23, 10회차 미만 학교만 자료가 있다)
    if 'region_peers' in d:
        rp = d['region_peers']; reg = [s for s in a['sections'] if s['heading'].startswith('같은 지역 학교와 비교')]
        if rp and not reg: err.append('지역 비교 자료가 있는데 "같은 지역 학교와 비교" 섹션 없음')
        if not rp and reg: err.append('지역 비교 자료가 없는데 섹션을 씀')
        if rp and reg:
            t = reg[0].get('table')
            if not t: err.append('지역 비교 표 없음')
            else:
                me = {'total': f['total'], 'written': len(f['written']), 'hard': len(f['bands']['어려움'])}
                want = {p['school']: p for p in rp['peers']}
                seen = set()
                for r in t['rows']:
                    name = r[0].replace('(이 시험)', '').strip()
                    w = me if name == d['school'] or '(이 시험)' in r[0] else want.get(name)
                    if w is None: err.append(f'지역 비교 표에 자료에 없는 학교: {r[0]}'); continue
                    seen.add(name)
                    got = (nums(r[1])[:1], nums(r[2])[:1], nums(r[3])[:1])
                    if got != ([w['total']], [w['written']], [w['hard']]): err.append(f'지역 비교 표 {r[0]}: {r[1:4]} ≠ {w["total"]},{w["written"]},{w["hard"]}')
                miss = set(want) - seen
                if miss: err.append(f'지역 비교 표에 빠진 학교: {sorted(miss)}')
                rt = body(dict(a, sections=reg, summary=[], faq=[]))
                for m in re.finditer(r'(\d+)\s*개\s*학?교\s*중\s*(\d+)\s*위', rt):
                    if (int(m.group(1)), int(m.group(2))) != (rp['rank_out_of'], rp['this_rank_by_hard']):
                        err.append(f'지역 순위 "{m.group(0)}" ≠ {rp["rank_out_of"]}개교 중 {rp["this_rank_by_hard"]}위')
    a = dict(a, sections=[s for s in a['sections'] if not s['heading'].startswith('작년 시험과 비교') and not s['heading'].startswith('같은 지역 학교와 비교')])
    txt_this = body(a)
    if len(txt) < 4000: err.append(f'분량 부족 {len(txt)}자')
    if str(f['total']) + '문항' not in txt: err.append(f'총 문항 수 {f["total"]} 언급 없음')
    # 정답 노출·만들어내기
    for pat, why in [(r'(?<![단해])(정답|답)\s*(은|는|이|:|=|→)?\s*[-+]?\d', '답 값 노출'), (r'→\s*답', '답 노출'), (r'[①②③④⑤]', '선택지 번호'),
                     (r'정답률|평균\s*점수|등급\s*컷|등급컷|학군|학구열|킬러\s*문항(?!이라)', '자료에 없는 정보/단정')]:
        for m in re.finditer(pat, txt):
            ctx = txt[max(0, m.start() - 15):m.end() + 10].replace('\n', ' ')
            if '등급컷이 아닙' in ctx or '등급컷이나' in ctx or '정답률이나' in ctx or '확인된 것은 아니' in ctx: continue
            err.append(f'{why}: …{ctx}…')
    # 문항별 정리: 모든 문항, label 의 난이도가 자료와 같아야 한다
    per = {q['no']: q for q in d['questions']}
    sec = [s for s in a['sections'] if s['heading'].startswith('문항별 정리')]
    if not sec: err.append('문항별 정리 섹션 없음')
    else:
        seen = set()
        for it in sec[0].get('items', []):
            m = re.match(r'(\d+)번 · (.+?) · (쉬움|보통|어려움)', it['label'])
            if not m: err.append(f'label 형식: {it["label"]}'); continue
            no = int(m.group(1)); seen.add(no)
            if no not in per: err.append(f'없는 문항 번호: {no}'); continue
            if m.group(3) != per[no]['band']: err.append(f'{no}번 난이도 {m.group(3)} ≠ 자료 {per[no]["band"]}')
            if ('(서술)' in it['label']) != (per[no]['kind'] != '객관식'): err.append(f'{no}번 서술 표시 불일치')
        miss = sorted(set(per) - seen)
        if miss: err.append(f'문항별 정리에 빠진 번호: {miss}')
    # 난이도 표: 행마다 문항 수·번호가 자료와 같아야 한다
    for s in a['sections']:
        t = s.get('table')
        if not t: continue
        for r in t['rows']:
            b = r[0].split('(')[0].strip()
            if b in f['bands']:
                want = f['bands'][b]
                if str(len(want)) != r[1].strip(): err.append(f'표 {b} 문항 수 {r[1]} ≠ {len(want)}')
                if sorted(nums(r[3])) != sorted(want) and want: err.append(f'표 {b} 번호 {r[3]} ≠ {want}')
            u = r[0].strip()
            if u in f['units']:
                want = f['units'][u]
                if str(len(want)) != r[1].strip(): err.append(f'표 {u} 문항 수 {r[1]} ≠ {len(want)}')
                if sorted(nums(r[2])) != sorted(want): err.append(f'표 {u} 번호 {r[2]} ≠ {want}')
    # 요약의 "어려움 N" 류 숫자 대조
    for b, v in f['bands'].items():
        for m in re.finditer(b + r'\s*(\d+)\s*문항', txt_this):
            if int(m.group(1)) != len(v): err.append(f'"{m.group(0)}" ≠ {b} {len(v)}문항')
    return err


bad = 0
args = sys.argv[1:]
outdir = 'out'
if args[:1] == ['--dir']: outdir, args = args[1], args[2:]
for eid in args:
    e = check(eid, outdir)
    if e:
        bad += 1; print('FAIL', eid); [print('  -', x) for x in e]
    else:
        print('OK', eid)
sys.exit(1 if bad else 0)
