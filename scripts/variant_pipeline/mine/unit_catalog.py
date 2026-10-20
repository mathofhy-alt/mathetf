# -*- coding: utf-8 -*-
"""같은 단원 다른 원본들의 변형 수법 묶음 (2026-10-20 대표: 수법을 더 모아 줬을 때와 적을 때 비교)

  python scripts/variant_pipeline/mine/unit_catalog.py <단원> <제외할 원본 id> <out.md> [--mine scratch/variant_mine] [--max 4]

scratch/variant_mine/*/mine.json 가운데 원본 단원이 같은 것(제외 id 빼고)의 풀이 뼈대·숫자변형 손잡이·심한 변형 수법을 모은다.
변형 파이프라인 --similar 파일 뒤에 붙여 쓴다(이 원본 자신의 사례가 먼저, 이것은 참고).
"""
import argparse, json
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('unit'); ap.add_argument('exclude'); ap.add_argument('out')
    ap.add_argument('--mine', default='scratch/variant_mine'); ap.add_argument('--max', type=int, default=4)
    a = ap.parse_args()
    got = []
    for d in sorted(Path(a.mine).iterdir()):
        if d.name == a.exclude or not (d / 'mine.json').is_file() or not (d / 'meta.json').is_file(): continue
        m = json.loads((d / 'meta.json').read_text(encoding='utf-8-sig'))
        if m['src'].get('unit') != a.unit: continue
        j = json.loads((d / 'mine.json').read_text(encoding='utf-8-sig'))
        got.append((m['src'], j))
    got = got[:a.max]
    L = [f'# 같은 단원({a.unit}) 다른 원본들의 실제 변형 수법 — 참고용',
         '위 사례(이 원본 자신의 변형)가 먼저다. 아래는 같은 단원의 **다른 문제**를 강사들이 변형한 수법이다. 이 원본의 틀에 자연스럽게 맞는 손잡이·수법만 빌려 쓰고, 다른 문제의 틀을 이 원본에 옮겨 붙이지 마라.', '']
    for s, j in got:
        L += [f"## {s['school']} {s['year']} {s['semester']} {s['question_number']}번 (난이도 {s['difficulty']})", f"- 풀이 뼈대: {j.get('skeleton', '')}",
              '- 숫자변형 손잡이:'] + [f'  - {x}' for x in j.get('knob_catalog', [])] + ['- 심한 변형 수법:'] + ([f'  - {x}' for x in j.get('heavy_catalog', [])] or ['  - (없음)']) + ['']
    Path(a.out).write_text('\n'.join(L), encoding='utf-8')
    print(a.out, len(got), '원본')


if __name__ == '__main__':
    main()
