# -*- coding: utf-8 -*-
"""시험지출제 카드 「단원 옮기기」 뒤처리 (2026-10-20)

  python scripts/types/apply_unit_moves.py [--dry-run]

① status='pending'(다른 과목으로): 그 문항의 회차 개인DB 행에 source_db_id 가 있는지 먼저 본다 —
   없으면 (그 행이 하나로 특정되고, 폴백 조건 문항 수 == source_db_id 문항 수일 때만) 채운 뒤 과목·단원을 바꾼다.
   9/16 사고: 과목만 바꿔 120문항이 자기 회차 개인DB 에서 빠졌다(dbFilter 폴백은 과목을 본다). 특정이 안 되면 failed + 사유.
② status='done'(단원만 바뀐 것): 새 단원 기준 대표 유형을 assign_new.py --pending 으로 붙이고 typed 로.
매일 11시 원본제보 처리(scripts/hq/daily_report_solve.py) 첫머리에서 부른다.
"""
import argparse, datetime, json, os, re, subprocess, sys, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env = {}
for l in open(os.path.join(ROOT, '.env.local'), encoding='utf-8'):
    m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', l)
    if m: env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
URL = env['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/') + '/rest/v1/'; KEY = env['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY}
PENDING = r'C:\mathetf_types\_pending_new.json'


def req(method, table, q, body=None, prefer=None):
    u = URL + table + '?' + urllib.parse.urlencode(q, safe='*(),.:')
    h = dict(H, **({'Content-Type': 'application/json'} if body is not None else {}), **({'Prefer': prefer} if prefer else {}))
    r = urllib.request.urlopen(urllib.request.Request(u, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None), timeout=60)
    t = r.read().decode() or 'null'
    return json.loads(t), r.headers.get('Content-Range')


def get(table, **q): return req('GET', table, q)[0]


def count(**q):
    _, cr = req('GET', 'questions', dict(select='id', **q), prefer='count=exact')
    return int((cr or '*/0').split('/')[-1])


def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()


def mark(mid, **f): req('PATCH', 'question_unit_moves', {'id': f'eq.{mid}'}, f, 'return=minimal')


def term(sem):
    m = re.match(r'(\d)학기(중간|기말)', sem or '')
    return (int(m.group(1)), m.group(2) + '고사') if m else (None, None)


def cross(mv, dry):
    q = get('questions', select='id,subject,unit,school,year,grade,semester,source_db_id', id='eq.' + mv['question_id'])
    if not q: return 'failed', '문항 없음'
    q = q[0]; src = q['source_db_id']
    if not src: return 'failed', '문항에 source_db_id 없음 — 손으로 확인'
    s, e = term(q['semester']); g = re.sub(r'\D', '', str(q['grade'] or ''))
    rows = get('exam_materials', select='id,source_db_id,subject', content_type='eq.개인DB', school='eq.' + q['school'],
               exam_year='eq.' + str(q['year']), **({'grade': 'eq.' + g} if g else {}), **({'semester': f'eq.{s}', 'exam_type': 'eq.' + e} if s else {}))
    hit = [r for r in rows if r['source_db_id'] == src]
    if not hit:
        cand = [r for r in rows if not r['source_db_id'] and r['subject'] == q['subject']]
        if len(cand) != 1: return 'failed', f'회차 개인DB 행 특정 안 됨({len(cand)}개) — 손으로 확인'
        n_src = count(source_db_id='eq.' + src)
        fb = dict(school='eq.' + q['school'], year='eq.' + str(q['year']), semester='eq.' + q['semester'], subject='eq.' + q['subject'])
        if q['grade']: fb['grade'] = 'eq.' + q['grade']
        n_fb = count(**fb)
        if n_src != n_fb: return 'failed', f'문항 수 불일치(source_db_id {n_src} · 폴백 {n_fb}) — 손으로 확인'
        if not dry: req('PATCH', 'exam_materials', {'id': 'eq.' + cand[0]['id']}, {'source_db_id': src}, 'return=minimal')
        note = f'개인DB 행 {cand[0]["id"][:8]} 에 source_db_id 채움({n_src}문항 대조)'
    else:
        note = '개인DB source_db_id 있음'
    if not dry:
        req('PATCH', 'questions', {'id': 'eq.' + q['id']}, {'subject': mv['to_subject'], 'unit': mv['to_unit']}, 'return=minimal')
        req('DELETE', 'question_types', {'question_id': 'eq.' + q['id']}, prefer='return=minimal')
    return 'done', note


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--dry-run', action='store_true'); a = ap.parse_args()
    for mv in get('question_unit_moves', select='*', status='eq.pending', order='id.asc'):
        try: st, note = cross(mv, a.dry_run)
        except Exception as ex: st, note = 'failed', f'오류 {ex}'
        print('다른 과목', mv['question_id'][:8], f"{mv['from_subject']} {mv['from_unit']} → {mv['to_subject']} {mv['to_unit']}", st, note, flush=True)
        if not a.dry_run: mark(mv['id'], status=st, note=note, done_at=now())
    done = get('question_unit_moves', select='id,question_id,to_unit', status='eq.done')
    if not done or a.dry_run:
        print(f'유형 붙일 문항 {len(done)}개' + (' (시험 실행 — 안 붙임)' if a.dry_run else '')); return
    pend = set(json.load(open(PENDING, encoding='utf-8'))) if os.path.exists(PENDING) else set()
    json.dump(sorted(pend | {d['question_id'] for d in done}), open(PENDING, 'w', encoding='utf-8'))
    r = subprocess.run([sys.executable, '-X', 'utf8', os.path.join(ROOT, 'scripts', 'types', 'assign_new.py'), '--pending'], cwd=ROOT,
                       capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=3 * 3600)
    print((r.stdout or '').strip().splitlines()[-1:] or [''])
    ids = [d['question_id'] for d in done]
    typed = {t['question_id']: t['unit'] for t in get('question_types', select='question_id,unit', question_id='in.(' + ','.join(ids) + ')')}
    for d in done:
        if typed.get(d['question_id']) == d['to_unit']: mark(d['id'], status='typed')
    print(f"유형 붙임 {sum(1 for d in done if typed.get(d['question_id']) == d['to_unit'])}/{len(done)}")


if __name__ == '__main__':
    main()
