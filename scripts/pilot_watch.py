# -*- coding: utf-8 -*-
"""
'문항 발문 텍스트' 시험(2026-08-29 배포)의 관찰 장치.

[무엇을 시험하나]
exam 상세 페이지의 실질 내용인 시험지가 미리보기 '이미지' 로만 있어 검색엔진이 본문으로 못 읽는다.
10개 회차에만 문항 발문을 텍스트로 실었다(본문 2,247자 → 5,554자). 나머지 462개는 그대로다.
→ 텍스트를 실은 쪽이 색인·노출·유입에서 나아지는가?

[짝을 맞춘 이유]
462개 전체와 비교하면 학교·과목·문항수가 뒤섞여 결론이 안 난다.
파일럿 10개 각각에 **같은 과목·비슷한 문항수**의 회차를 하나씩 붙여 10쌍으로 본다.

[이 스크립트가 할 수 있는 것 / 없는 것]
할 수 있다  : 두 쪽이 살아 있는지(HTTP), 본문 글자수, 제목. 기준선을 남기고 변화를 보여준다.
             ★ 대조군이 오염되지 않았는지 감시한다 — 나중에 gen_exam_questions 를 592개 전체로
               돌려버리면 대조군에도 발문이 들어가 시험 자체가 무효가 된다. 글자수로 잡힌다.
할 수 없다  : 색인 여부·노출·클릭. GSC·네이버 서치어드바이저·GA4 는 API 접근이 없다.
             → 아래 '사람이 볼 것' 목록을 찍어주니 그 화면에서 확인해야 한다.

사용:
    python scripts/pilot_watch.py            # 스냅샷 찍고 지난 기록과 비교
    python scripts/pilot_watch.py --urls     # 사람이 확인할 URL 목록만 출력
"""
import json, os, re, sys, subprocess
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, 'pilot_watch_log.json')
KST = timezone(timedelta(hours=9))

try: sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
except Exception: pass

# 파일럿 ↔ 대조군. 같은 과목·비슷한 문항수로 붙였다. (선정: 2026-08-29)
PAIRS = [
    ('3dcb6acc-4c56-413e-bbc8-6ed7507ccfb1', '대전여자고등학교 2025 기말고사 공통수학1',
     'a02ff811-212e-4cf1-acec-080d0c9fbc7d', '반포고등학교 2025 기말고사 공통수학1'),
    ('e5e8b183-6d1c-4d00-8e36-78b043139c43', '은광여자고등학교 2025 기말고사 수학I',
     '64c83920-3076-4871-8e68-9bdbbb606020', '양천고등학교 2025 기말고사 수학I'),
    ('d9136c81-f69d-4060-88b4-55f0ec421949', '서울세종고등학교 2025 기말고사 공통수학1',
     '46af1b3a-eaf1-4555-ac0c-d054dc79c786', '잠실여자고등학교 2025 기말고사 공통수학1'),
    ('f8bb7be4-4894-4138-9c44-6903f7316567', '영동일고등학교 2025 중간고사 수학II',
     '8d89aef2-aba4-42bb-a5f6-d47f51b12283', '대원외국어고등학교 2025 중간고사 수학II'),
    ('4544d2ed-5d03-415d-8c23-8b9c80b630ba', '대전외국어고등학교 2025 기말고사 공통수학1',
     '2be2dc1a-570a-4b9c-a38d-c82eebbd745c', '인천하늘고등학교 2025 기말고사 공통수학1'),
    ('244ddd72-08e6-449e-9dc3-6fab68be0023', '대구여자고등학교 2025 중간고사 수학II',
     '213d052c-7fac-4034-9454-621e903315fa', '동산고등학교 2025 중간고사 수학II'),
    ('d217403c-fc3b-4027-8a70-975c1cb66de5', '상문고등학교 2025 중간고사 공통수학1',
     '39f84422-7d0f-4333-91e8-8febd42df250', '대전노은고등학교 2025 기말고사 공통수학1'),
    ('0f170729-9fef-46b6-8a09-bb0f091c5173', '용인한국외국어대학교부설고등학교 2025 기말고사 공통수학1',
     '6e29056b-988c-4889-b63a-ec5ee1b9176b', '가락고등학교 2025 중간고사 공통수학1'),
    ('e74099f1-09eb-4733-b4f7-4768de59b3f5', '창덕여자고등학교 2025 기말고사 공통수학1',
     '23e70a5b-6eb4-4dc4-ab7a-16b96dfa6945', '경기여자고등학교 2026 중간고사 공통수학1'),
    ('9384cd62-48dc-47dc-aab4-7cdfc647103e', '중동고등학교 2026 중간고사 공통수학1',
     '4560a502-6655-4d70-b487-1a3ecb7dad7c', '목동고등학교 2025 기말고사 공통수학1'),
]


def fetch(url):
    """본문 글자수와 제목. curl 로 받아 태그를 걷어낸다."""
    r = subprocess.run(['curl', '-s', '-w', '\n%{http_code}', url],
                       capture_output=True, text=True, encoding='utf-8', errors='replace')
    h = r.stdout
    code = h.rsplit('\n', 1)[-1].strip()
    ttl = re.search(r'<title>(.*?)</title>', h, re.S)
    t = re.sub(r'<script[^>]*>.*?</script>', '', h, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = re.sub(r'\s+', ' ', t)
    return {'http': code, 'chars': len(t), 'title': (ttl.group(1) if ttl else '')[:90],
            'has_list': '문항 목록' in h}


def main():
    urls = [(f'https://mathetf.com/exam/{p}', pl, f'https://mathetf.com/exam/{c}', cl)
            for p, pl, c, cl in PAIRS]

    if '--urls' in sys.argv:
        print('■ 사람이 확인할 것 — GSC(URL 검사) / 네이버 서치어드바이저 / GA4 페이지별 세션\n')
        print('[발문 넣은 쪽 — 10개]')
        for u, l, _, _ in urls: print(f'  {u}\n      {l}')
        print('\n[대조군 — 10개, 발문 없음]')
        for _, _, u, l in urls: print(f'  {u}\n      {l}')
        return

    now = datetime.now(KST)
    snap = {'at': now.isoformat(), 'rows': []}
    print(f'스냅샷 {now:%Y-%m-%d %H:%M} KST\n')
    print(f'{"":<22}{"HTTP":>5}{"본문자수":>9}{"발문":>6}   {"":<22}{"HTTP":>5}{"본문자수":>9}{"발문":>6}')
    print('-' * 92)
    warn = []
    for pu, pl, cu, cl in urls:
        a, b = fetch(pu), fetch(cu)
        snap['rows'].append({'pilot': pu, 'p': a, 'control': cu, 'c': b})
        print(f"{pl[:21]:<22}{a['http']:>5}{a['chars']:>9,}{'O' if a['has_list'] else '-':>6}   "
              f"{cl[:21]:<22}{b['http']:>5}{b['chars']:>9,}{'O' if b['has_list'] else '-':>6}")
        if not a['has_list']:
            warn.append(f'파일럿에 발문이 없다: {pu}')
        if b['has_list']:
            warn.append(f'★ 대조군이 오염됐다(발문이 들어감): {cu} — 시험이 무효다')
        if a['http'] != '200' or b['http'] != '200':
            warn.append(f'응답 이상: {pu} {a["http"]} / {cu} {b["http"]}')

    hist = json.load(open(LOG, encoding='utf-8')) if os.path.exists(LOG) else []
    if hist:
        prev = hist[-1]
        pa = datetime.fromisoformat(prev['at'])
        print(f'\n[지난 스냅샷 {pa:%m-%d %H:%M} 대비 본문 글자수 변화]')
        pm = {r['pilot']: r for r in prev['rows']}
        for r in snap['rows']:
            o = pm.get(r['pilot'])
            if not o: continue
            dp = r['p']['chars'] - o['p']['chars']
            dc = r['c']['chars'] - o['c']['chars']
            if dp or dc:
                print(f"  {r['pilot'][:8]}  파일럿 {dp:+,}  대조군 {dc:+,}")
        else:
            print('  (변화 없음이면 아무것도 안 뜬다)')
    hist.append(snap)
    json.dump(hist, open(LOG, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n기록 {len(hist)}회차 → {LOG}')

    if warn:
        print('\n⚠ ' + '\n⚠ '.join(warn))
    else:
        print('\n이상 없음 — 파일럿 10개에 발문 있고, 대조군 10개는 깨끗하다.')

    print('\n※ 색인·노출·클릭은 이 스크립트가 못 잰다. `--urls` 로 목록을 뽑아')
    print('  GSC URL 검사와 네이버 서치어드바이저에서 직접 봐야 한다.')


if __name__ == '__main__':
    main()
