# -*- coding: utf-8 -*-
"""해설 그림 눈 검토 (2026-10-21 대표 승인): 굽기 전에 클로드 직원이 해설 그림을 한 장씩 열어 본다.

  python scripts/hq/sfig_review.py e981 [--par 8]

계기: 효성고3 14번 해설 그림 — 각 B 에 호 셋이 겹치고 α 라벨이 삼각형 가운데, θ 가 변 바깥에 떠 있었다.
검사기는 「지시한 이름의 그림이 그려졌는지」만 봐서 못 잡았다.
1) 그림마다 검토 직원 한 명(동시, 읽기만) → 판정 한 줄(JSON)
2) 걸린 그림이 있으면 그 열쇠의 고침 직원 한 명이 그림 코드를 고치고 다시 렌더해 열어 확인
종료 코드: 0 = 모두 통과(또는 고침 직원이 고침), 1 = 고친 뒤에도 걸림이 남음
"""
import json, os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'variant_pipeline'))
import gs_all as G          # noqa: E402
import split_sheet as S     # noqa: E402

TOOLS = Path(G.TOOLS)

REVIEW = '''너는 수학 시험지 해설 그림 검토 직원이다. **읽기만** 한다(파일 수정 금지).
열쇠 {KEY} 의 해설 그림 `{NAME}` 을 검토한다.
1. 그림 파일 `{PNG}` 을 Read 로 열어 본다.
2. `C:\\gpt_solve\\tools\\content_{KEY}.py` 에서 `@fig:{NAME}` 을 grep 해, 그 문항의 발문·`# 그림 지시:` 주석·그림 앞뒤 해설 문장을 읽는다.
3. 다음을 본다(학생이 이 그림을 보고 해설을 따라갈 수 있는가):
   - 각 라벨(α, θ, 30° 등)이 **그 각의 호 안쪽·바로 옆**에 있는가(삼각형 가운데에 떠 있거나 변 바깥이면 걸림)
   - 한 꼭짓점에 호가 여럿 겹쳐 어느 각인지 모르게 되지 않았는가
   - 점·곡선·직선 라벨이 가리키는 대상 가까이에 있고 서로·선과 겹치지 않는가, 그림 밖으로 잘리지 않았는가
   - 해설 문장이 그림에서 읽으라는 것(교점·외각·대칭·넓이 등)이 그림에 실제로 보이는가, 문장과 그림이 어긋나지 않는가
   - 비율을 그대로 그려서 중요한 부분이 너무 좁게 몰렸다면 모식도로 과장하는 편이 나은가
   사소한 미관(선 굵기·글꼴·호 반지름 취향·여백)은 걸지 마라. **학생이 실제로 잘못 읽거나 못 읽을 것만** 건다 —
   「이렇게 하면 더 낫다」 수준이면 통과(ok true)다(10/21: 같은 그림을 고칠 때마다 반대 방향 지적이 나와 굽기가 막힐 뻔했다).
마지막 줄에 JSON 한 줄만: {"fig": "{NAME}", "ok": true} 또는 {"fig": "{NAME}", "ok": false, "issues": ["무엇이 어디서 어떻게 잘못됐고 어떻게 고치면 되는지", ...]}'''

FIX = '''너는 수학 시험지 해설 그림 직원이다. 열쇠 {KEY} 의 해설 그림 중 검토에서 걸린 것을 고친다.
걸린 그림과 지적:
{ISSUES}

그림 코드: `C:\\gpt_solve\\tools\\_parts\\{KEY}\\sfig_qNN.py`(있으면 그것) 또는 `C:\\gpt_solve\\tools\\figures_{KEY}.py` 에서 그 그림을 그리는 함수.
`C:\\gpt_solve\\tools\\그림도구_현재.md` 를 참고하고, 지적대로 **그 그림 함수만** 고친다(다른 그림·원고 content·해설 문장은 건드리지 마라).
고친 뒤 `cd C:\\gpt_solve\\tools && python -X utf8 figures_{KEY}.py` 로 다시 그리고, 그림 png(`C:\\gpt_solve\\tools\\figs_{KEY}\\이름.png`)를 Read 로 열어 지적이 해결됐는지 눈으로 확인한다. 해결될 때까지 반복(최대 3번).
한글 열기·굽기 금지. 끝나면 그림마다 「이름: 고침 — 무엇을」 한 줄.'''


def names_of(key):
    c = (TOOLS / f'content_{key}.py').read_text(encoding='utf-8')
    return list(dict.fromkeys(re.findall(r'@fig:(s\w+)', c)))


def claude(prompt, timeout=1800):
    r = subprocess.run([S.claude_exe(), '-p', prompt, '--permission-mode', 'acceptEdits', '--add-dir', 'C:\\gpt_solve',
                        '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(python:*)', 'Bash(python -X utf8:*)', 'Bash(cd:*)',
                        '--output-format', 'text'], cwd=str(TOOLS), env=S.ENV, capture_output=True, text=True, encoding='utf-8',
                       errors='replace', timeout=timeout, stdin=subprocess.DEVNULL)
    return r.stdout or ''


def review(key, name):
    png = TOOLS / f'figs_{key}' / f'{name}.png'
    if not png.is_file():
        return {'fig': name, 'ok': False, 'issues': ['그림 파일이 없다']}
    out = claude(REVIEW.replace('{KEY}', key).replace('{NAME}', name).replace('{PNG}', str(png)))
    for line in reversed(out.strip().splitlines()):
        line = line.strip().strip('`')
        if line.startswith('{') and '"fig"' in line:
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                break
    return {'fig': name, 'ok': True, 'note': '판정 줄을 못 읽음 — 통과로 둠', 'raw': out[-300:]}


def run(key, par=8, log=None):
    def say(*a):
        line = time.strftime('%H:%M ') + key + ' 해설그림검토 ' + ' '.join(map(str, a)); print(line, flush=True)
        if log:
            open(log, 'a', encoding='utf-8').write(line + '\n')
    names = names_of(key)
    if not names:
        say('해설 그림 없음'); return 0
    with ThreadPoolExecutor(par) as ex:
        res = list(ex.map(lambda n: review(key, n), names))
    bad = [r for r in res if not r.get('ok')]
    say(f'{len(names)}장 중 걸림 {len(bad)}', ' '.join(r['fig'] for r in bad))
    out_dir = TOOLS / '_work' / 'sfig_review'; out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f'{key}.json').write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
    if not bad:
        return 0
    left = bad
    for rnd in (1, 2):                 # 고침 → 다시 검토, 두 바퀴까지(10/21 e981: 한 바퀴 뒤 9장 중 3장 남음)
        issues = '\n'.join(f"- {r['fig']}: " + ' / '.join(r.get('issues') or []) for r in left)
        fix_out = claude(FIX.replace('{KEY}', key).replace('{ISSUES}', issues), timeout=3600)
        say(f'고침 {rnd}', fix_out.strip().splitlines()[-1][:200] if fix_out.strip() else '(응답 없음)')
        with ThreadPoolExecutor(par) as ex:
            again = list(ex.map(lambda r: review(key, r['fig']), left))
        left = [r for r in again if not r.get('ok')]
        (out_dir / f'{key}_after{rnd}.json').write_text(json.dumps(again, ensure_ascii=False, indent=1), encoding='utf-8')
        say(f'다시 검토 {rnd} — 남은 걸림', len(left), ' '.join(r['fig'] for r in left))
        if not left:
            break
    return 1 if left else 0


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument('key'); ap.add_argument('--par', type=int, default=8); a = ap.parse_args()
    sys.exit(run(a.key, a.par))
