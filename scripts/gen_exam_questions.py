# -*- coding: utf-8 -*-
"""
exam 페이지에 실을 '문항 발문 텍스트' 를 src/lib/exam-questions.json 으로 뽑는다.

[왜 파일인가]
지금은 10개 회차만 넣어보는 시험이다. DB 컬럼을 새로 만들면 DDL 이 필요하고
Supabase 컴퓨트가 MICRO 라 매 요청마다 content_xml(회차당 400KB)을 읽는 것도 부담이다.
exam-redirects.json 과 같은 방식으로 저장소에 넣으면 추가 왕복이 0이고 되돌리기도 쉽다.
※ 전체 592개 회차로 넓힐 때는 2MB 를 넘으므로 그때는 DB 컬럼으로 옮겨야 한다.

[무엇을 싣는가]
- 문항 발문과 선택지만. **해설은 절대 싣지 않는다** (유일한 판매 근거).
  해설은 content_xml 의 <ENDNOTE> 안에 있고 question_text.py 가 그 서브트리를 건너뛴다.
- 문제는 이미 미리보기 이미지·무료 PDF·강사카페 배포로 전량 무료 공개 중이라 판매 잠식이 없다.
- 수식 변환에 실패한 문항이 하나라도 있으면 그 회차는 통째로 제외한다.
  깨진 수식을 노출하면 구글이 저품질 자동생성으로 보고 색인 제외가 오히려 굳는다.

사용:
    python scripts/gen_exam_questions.py            # 생성
    python scripts/gen_exam_questions.py --check    # 파일과 DB 가 일치하는지만 확인
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from question_text import build, QuestionTextError, _db

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass

OUT = os.path.join(ROOT, 'src', 'lib', 'exam-questions.json')

# ── 1차 시험 대상 10개 회차 ────────────────────────────────────────────
# 고른 기준: PDF·해설 대표 페이지 / 미리보기 있음 / 문항 18개 이상 /
#            수식 변환 실패 0건 / 그림 비율 낮은 순 / 학교·과목·지역 안 겹치게.
# 나머지 462개 페이지가 그대로 대조군이 된다.
PILOT = [
    ('d9136c81-f69d-4060-88b4-55f0ec421949',
     '서울세종고등학교 2025 1학년 1학기 기말고사 공통수학1 · 문항 25 · 2,817자'),
    ('244ddd72-08e6-449e-9dc3-6fab68be0023',
     '대구여자고등학교 2025 2학년 1학기 중간고사 수학II · 문항 24 · 3,635자'),
    ('d217403c-fc3b-4027-8a70-975c1cb66de5',
     '상문고등학교 2025 1학년 1학기 중간고사 공통수학1 · 문항 24 · 2,899자'),
    ('e74099f1-09eb-4733-b4f7-4768de59b3f5',
     '창덕여자고등학교 2025 1학년 1학기 기말고사 공통수학1 · 문항 23 · 2,682자'),
    ('3dcb6acc-4c56-413e-bbc8-6ed7507ccfb1',
     '대전여자고등학교 2025 1학년 1학기 기말고사 공통수학1 · 문항 26 · 3,813자'),
    ('f8bb7be4-4894-4138-9c44-6903f7316567',
     '영동일고등학교 2025 2학년 2학기 중간고사 수학II · 문항 25 · 3,457자'),
    ('4544d2ed-5d03-415d-8c23-8b9c80b630ba',
     '대전외국어고등학교 2025 1학년 1학기 기말고사 공통수학1 · 문항 25 · 3,081자'),
    ('0f170729-9fef-46b6-8a09-bb0f091c5173',
     '용인한국외국어대학교부설고등학교 2025 1학년 1학기 기말고사 공통수학1 · 문항 24 · 3,626자'),
    ('9384cd62-48dc-47dc-aab4-7cdfc647103e',
     '중동고등학교 2026 1학년 1학기 중간고사 공통수학1 · 문항 20 · 3,311자'),
    ('e5e8b183-6d1c-4d00-8e36-78b043139c43',
     '은광여자고등학교 2025 2학년 1학기 기말고사 수학I · 문항 26 · 4,119자'),
]


def load_pilot():
    return [i for i, _ in PILOT]


def main():
    requests, U, H = _db()
    ids = load_pilot()
    out, skipped = {}, []
    for eid in ids:
        row = requests.get(f'{U}/rest/v1/exam_materials', headers=H, params=[
            ('select', 'id,school,exam_year,grade,semester,exam_type,subject'),
            ('id', 'eq.' + eid)], timeout=60).json()
        if not row:
            skipped.append((eid, 'exam_materials 에 없음')); continue
        r = row[0]
        et = r.get('exam_type') or ''
        if '중간' in et:   part = f"{r['semester']}학기중간"
        elif '기말' in et: part = f"{r['semester']}학기기말"
        else:
            skipped.append((eid, '내신 중간·기말이 아님')); continue
        key = f"{r['school']}_{r['exam_year']}_{part}_{r['subject']}"

        qs = requests.get(f'{U}/rest/v1/questions', headers=H, params=[
            ('select', 'question_number,question_index,content_xml'),
            ('source_db_id', 'eq.' + key),
            ('order', 'question_index.asc')], timeout=180).json()
        if not qs:
            skipped.append((eid, f'문항 없음 ({key})')); continue

        items, fail = [], 0
        for i, q in enumerate(qs):
            try:
                b = build(q['content_xml'])
            except QuestionTextError as e:
                fail += 1
                continue
            num = q.get('question_number')
            items.append({'n': str(num) if num not in (None, '') else str(i + 1),
                          't': b['text']})
        if fail:
            skipped.append((eid, f'수식 변환 실패 {fail}건 — 회차째 제외')); continue
        out[eid] = items
        print(f"  {r['school']} {r['exam_year']} {et} {r['subject']}  "
              f"문항 {len(items)}개 · {sum(len(x['t']) for x in items):,}자")

    if not out:
        sys.exit('생성된 것이 없다 — 파일을 건드리지 않는다')

    body = json.dumps(out, ensure_ascii=False, indent=1) + '\n'
    if '--check' in sys.argv:
        cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        print('일치' if cur == body else '불일치 — 다시 생성해야 한다')
        sys.exit(0 if cur == body else 1)
    open(OUT, 'w', encoding='utf-8', newline='\n').write(body)
    chars = sum(len(x['t']) for v in out.values() for x in v)
    print(f'\n{OUT}')
    print(f'  회차 {len(out)}개 · 문항 {sum(len(v) for v in out.values())}개 · {chars:,}자 '
          f'· 파일 {len(body.encode("utf-8"))/1024:.0f}KB')
    for eid, why in skipped:
        print(f'  건너뜀 {eid[:8]}  {why}')


if __name__ == '__main__':
    main()
