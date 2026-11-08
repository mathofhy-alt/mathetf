# -*- coding: utf-8 -*-
"""옛 가형/나형·A/B형 고2 모의고사 세트 순차 등록 (scratch_mock_old.py 호출)."""
import subprocess, sys, os, time
sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
# ⚠ 형 표기는 파일명이 아니라 **DB 기존 관례**를 따른다(같은 해 3·6·11월 회차와 갈리면 안 된다).
#   2006~2011 가형/나형 · 2012~2014 A형/B형 · 2015~2019 가형/나형 · 2020 전과목(형 구분 없음)
# ⚠ 9/8: SETS 를 정규식으로 바꾸다 아래 env/fails 줄까지 지운 사고 — 이 파일은 통째로 다시 쓴다.
SETS = [('2015', '9', '고2', '나형')]  # 9/8 재등록 — 15번 해설 수정본 반영

env = {**os.environ, 'PYTHONUTF8': '1', 'NODE_TLS_REJECT_UNAUTHORIZED': '0'}
fails = []
for i, s in enumerate(SETS, 1):
    t0 = time.time()
    print(f'\n########## [{i}/{len(SETS)}] {" ".join(s)} ##########', flush=True)
    # 파일명 접미와 DB 접미가 다른 경우를 흡수한다. 2020: DB '전과목' ↔ 파일엔 접미 없음
    file_suffix = '' if s[3] == '전과목' else s[3]
    p = subprocess.run([sys.executable, 'scripts_patched/scratch_mock_old.py', *s, file_suffix], env=env,
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    print((p.stdout or '') + (p.stderr or ''), flush=True)
    print(f'--- 소요 {int(time.time()-t0)}초 · 종료코드 {p.returncode}', flush=True)
    if p.returncode != 0:
        fails.append(' '.join(s))
print('\n===== 배치 종료 =====')
print('실패: ' + (', '.join(fails) if fails else '없음'))
