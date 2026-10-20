# -*- coding: utf-8 -*-
"""변형 파이프라인 입력 similar.md — 원본의 실제 학교 변형 사례 (2026-10-20)

  python scripts/variant_pipeline/mine/similar_ctx.py <원본 문항 id> <out.md> [--mine scratch/variant_mine]

사이트 「유사」(추천+풀이 유사) 상위 후보의 문제·해설 앞부분 + 있으면 그 원본의 판정(mine.json: 숫자변형 손잡이·심한 변형 수법).
"""
import argparse, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mine_variants import packet   # noqa: E402


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--mine', default='scratch/variant_mine')
    a = ap.parse_args()
    src, rows, text = packet(a.src)
    head = ['# 이 원본을 실제 학교 내신에서 변형한 사례 (사이트 「유사」 목록)',
            '대부분 강사가 원본을 보고 변형한 문제다. 「같은 문제」·「다른 문제」도 섞여 있다. 수식은 한글 수식 문법(⟦…⟧). 해설은 DB 해설이라 정석 보장이 없다.', '']
    mj = Path(a.mine) / a.src / 'mine.json'
    if mj.is_file():
        j = json.loads(mj.read_text(encoding='utf-8-sig'))
        head += ['## 판정 요약 (코덱스 대조, 대표 기준으로 시범 검증됨)', f"- 풀이 뼈대: {j.get('skeleton', '')}"]
        head += ['- 실제로 쓰인 숫자변형 손잡이:'] + [f'  - {x}' for x in j.get('knob_catalog', [])]
        head += ['- 실제 심한 변형 수법:'] + ([f'  - {x}' for x in j.get('heavy_catalog', [])] or ['  - (이 목록에는 없음)'])
        head += ['- 후보별 판정:'] + [f"  - 후보 {c.get('no')}: {c.get('relation')}{(' · ' + c['heavy_kind']) if c.get('heavy_kind') else ''}" for c in j.get('candidates', [])]
        head.append('')
    Path(a.out).write_text('\n'.join(head) + '\n' + text, encoding='utf-8')
    print(a.out, len(rows), '후보')


if __name__ == '__main__':
    main()
