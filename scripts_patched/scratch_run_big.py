# -*- coding: utf-8 -*-
"""[대량 배치 드라이버] 신규는 10세트씩 끊어 등록 → 기등록은 id 유지 교체 → 교체분 배치·후속.
   (9/28 — 350세트를 한 번에 돌리면 후속 스크립트 타임아웃·Supabase 부하가 커서 10개씩 끊는다)
사용: python scripts_patched/scratch_run_big.py   (먼저 scratch_batch_preflight.py 로 _trylog/_plan.json 을 만들어 둘 것)
로그: 한 줄 요약은 stdout, 묶음별 상세는 LOGDIR/big_*.log
"""
import os, re, sys, json, zlib, shutil, subprocess, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); os.chdir(ROOT)
LOGDIR = os.environ.get('BIG_LOGDIR', os.path.join(os.environ.get('TEMP', ROOT), 'big_logs')); os.makedirs(LOGDIR, exist_ok=True)
CH = 10
RUN_START = time.time()
now = lambda: time.strftime('%H:%M')
ENV = {**os.environ, 'PYTHONUTF8': '1', 'NODE_TLS_REJECT_UNAUTHORIZED': '0', 'SKIP_SIMILAR': '1'}   # 유사문항은 맨 끝에 한 번(아래)

base_plan = json.load(open('_trylog/_plan.json', encoding='utf-8'))
json.dump(base_plan, open('_trylog/_plan_big_orig.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
new_rows = base_plan['ok']; replace_bases = [s['base'] for s in base_plan.get('skip', []) if '기등록' in s.get('reason', '')]


def run_chunks(rows, tag):
    ok = fail = 0
    for i in range(0, len(rows), CH):
        n = i // CH + 1
        pf = f'_trylog/_plan_{tag}{n:02d}.json'
        json.dump({**base_plan, 'ok': rows[i:i + CH]}, open(pf, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        log = os.path.join(LOGDIR, f'big_{tag}{n:02d}.log')
        with open(log, 'w', encoding='utf-8') as fh:
            subprocess.run([sys.executable, 'scripts_patched/scratch_batch_run.py', '--plan', pf, '--workers', '2'], stdout=fh, stderr=subprocess.STDOUT, env=ENV)
        txt = open(log, encoding='utf-8', errors='replace').read()
        m = re.search(r'성공 (\d+) / 실패 (\d+)', txt)
        s, f = (int(m.group(1)), int(m.group(2))) if m else (0, len(rows[i:i + CH]))
        ok += s; fail += f
        extra = ' '.join(x for x in re.findall(r'^(미리보기: 성공 \d+ / 실패 [1-9]\d*|무료 문제 PDF: 성공 \d+ / 실패 [1-9]\d*)', txt, re.M))
        print(f'[{now()}] {tag} {n}/{(len(rows) + CH - 1) // CH}: 성공 {s} 실패 {f} {extra}'.rstrip())
        os.remove(pf)
    return ok, fail


print(f'[{now()}] 시작: 신규 {len(new_rows)} · 교체 {len(replace_bases)}')
s, f = run_chunks(new_rows, 'new')
print(f'[{now()}] 신규 끝: 성공 {s} 실패 {f}')

# 교체: 문항 id 유지 → 크롭 폴더 삭제
done_rep, bad_rep = [], []
for b in replace_bases:
    m = re.match(r'^[^_]+_[^_]+_(\d{4})년_([12])(중간|기말)_(.+?)([123])_(.+)$', b)
    if not m: bad_rep.append((b, '이름 형식')); continue
    year, sem, mk, school, grade, subject = m.groups()
    src = f'{school}_{year}_{sem}학기{mk}_{subject}'
    p = subprocess.run(['npx.cmd' if os.name == 'nt' else 'npx', 'tsx', 'scripts_patched/scratch_replace_inplace.ts', f'try/{b}.hml', src],
                       capture_output=True, text=True, encoding='utf-8', errors='replace', env=ENV)
    out = p.stdout + p.stderr
    if 'REPLACED=' not in out:
        bad_rep.append((b, (re.search(r'(문항 수가 다르다[^\n]*|Error[^\n]*)', out) or [None, out[-150:]])[0] if re.search(r'(문항 수가 다르다[^\n]*|Error[^\n]*)', out) else out[-150:])); continue
    shutil.rmtree(f'hwpx-python-tool/crop_batch/{zlib.crc32(b.encode("utf-8")):08x}_g{grade}s{sem}', ignore_errors=True)
    done_rep.append(b)
print(f'[{now()}] 교체 내용 갈아끼움 {len(done_rep)} · 실패 {len(bad_rep)}')
for b, why in bad_rep: print(f'   ✗ {b}: {why}')

if done_rep:
    subprocess.run([sys.executable, 'scripts_patched/scratch_batch_preflight.py'], capture_output=True, env=ENV)
    rp = json.load(open('_trylog/_plan.json', encoding='utf-8'))
    rows = [r for r in rp['ok'] if r[0] in set(done_rep)]
    base_plan = rp
    s, f = run_chunks(rows, 'rep')
    print(f'[{now()}] 교체 배치 끝: 성공 {s} 실패 {f}')
    # 후속(판매파일 재업로드·미리보기·무료PDF) — 10개씩
    json.dump({**rp, 'ok': rows}, open('_trylog/_plan_rep_all.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for i in range(0, len(rows), CH):
        log = os.path.join(LOGDIR, f'big_follow{i // CH + 1:02d}.log')
        with open(log, 'w', encoding='utf-8') as fh:
            subprocess.run([sys.executable, 'scripts_patched/scratch_replace_followup.py', *[r[0] for r in rows[i:i + CH]], '--plan', '_trylog/_plan_rep_all.json'],
                           stdout=fh, stderr=subprocess.STDOUT, env=ENV)
        txt = open(log, encoding='utf-8', errors='replace').read()
        print(f'[{now()}] 교체 후속 {i // CH + 1}: 재업로드 {txt.count("재업로드") // 2}세트 · ' + ' · '.join(re.findall(r'(미리보기: 완료: 성공 \d+ / 실패 \d+|무료 문제 PDF: 완료: 성공 \d+ / 실패 \d+)', txt)) + (' ⛔' if '⛔' in txt else ''))
    os.remove('_trylog/_plan_rep_all.json')

# [10/2] 유사문항 계산을 등록과 분리했다가 [10/5] 증분 모드로 가벼워져 맨 끝에 한 번 다시 붙였다(아래).

# 무료PDF·미리보기 실패분 재시도
for sc in ('generate_free_pdfs.py', 'generate_previews.py'):
    p = subprocess.run([sys.executable, os.path.join('scripts', sc)], capture_output=True, text=True, encoding='utf-8', errors='replace', env=ENV)
    print(f'[{now()}] 재시도 {sc}: ' + (re.findall(r'완료: [^\n]*', p.stdout) or ['?'])[-1])
# [2026-10-05] 유사문항 미리 계산 — 증분 모드라 배치 끝에 한 번 붙인다(사장님 지시). 1차(SKIP_AI) 실행은 아직 sorted 가 아니라 건너뛴다.
if os.environ.get('SKIP_AI') != '1':
    p = subprocess.run([sys.executable, os.path.join('scripts', 'precompute_similar.py')], capture_output=True, text=True, encoding='utf-8', errors='replace', env=ENV)
    print(f'[{now()}] 유사문항 미리 계산: ' + ' · '.join(re.findall(r'(임베딩 받음[^\n]*|완료: [^\n]*)', p.stdout)[-2:] or ['?']))
print(f'[{now()}] 끝')
