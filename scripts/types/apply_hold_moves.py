# -*- coding: utf-8 -*-
"""보류했던 과목·단원 동시 수정 304문항 반영 (2026-10-19, 사장 직접 검수 · 대표 승인 "네")

  python scripts/types/apply_hold_moves.py          반영(백업 → 한 건씩 PATCH → 전수 확인)
  python scripts/types/apply_hold_moves.py --undo   백업 값으로 되돌리기

대상: C:\\mathetf_types\\hold_order.json 312문항 중 검수에서 뺀 8문항(13·31·154·297·303·310·311·312번)을 제외한 304문항.
새 단원 = moves_final.json 의 to, 새 과목 = 그 단원의 2022 개정 과목. 백업: hold_apply_backup.json
"""
import sys, json, time, collections, requests, urllib3, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import scratch_report_auto as A
urllib3.disable_warnings(); sys.stdout.reconfigure(encoding='utf-8')
B = 'C:/mathetf_types'
SUB = {}
for s, us in {'공통수학1': ['다항식', '항등식', '복소수', '이차방정식', '이차함수', '여러가지방정식', '여러가지부등식', '순열조합', '행렬'],
              '공통수학2': ['평면좌표', '직선의방정식', '원의방정식', '도형의이동', '집합', '명제', '절대부등식', '함수', '합성함수와역함수', '유리함수', '무리함수'],
              '대수': ['지수', '로그', '지수함수', '로그함수', '삼각함수', '삼각함수그래프', '삼각함수활용', '등차등비수열', '수열의합', '수학적귀납법'],
              '미적분I': ['함수의극한', '함수의연속', '미분계수와도함수', '도함수의활용', '부정적분', '정적분', '정적분의활용'],
              '미적분II': ['수열의극한', '급수', '지수함수와로그함수의미분', '삼각함수의미분', '여러가지미분법', '여러가지적분법'],
              '확률과통계': ['여러가지순열', '중복조합', '확률', '조건부확률', '확률변수와확률분포', '정규분포', '통계적추정'],
              '기하': ['이차곡선', '평면벡터', '공간도형', '공간좌표']}.items():
    for u in us: SUB[u] = s
SKIP = {13, 31, 154, 297, 303, 310, 311, 312}


def patch(i, body):
    for _ in range(3):
        r = requests.patch(A.URL + '/rest/v1/questions', headers={**A.HJ, 'Prefer': 'return=minimal'}, params={'id': 'eq.' + i},
                           data=json.dumps(body, ensure_ascii=False).encode(), verify=False, timeout=60)
        if r.status_code < 300: return True
        time.sleep(5)
    return False


def fetch(ids):
    out = {}
    for j in range(0, len(ids), 80):
        for x in A.get('questions', {'select': 'id,subject,unit', 'id': 'in.(' + ','.join(ids[j:j + 80]) + ')'}): out[x['id']] = x
    return out


def main():
    if '--undo' in sys.argv:
        bk = json.load(open(B + '/hold_apply_backup.json', encoding='utf-8'))
        bad = [i for i, x in bk.items() if not patch(i, {'unit': x['unit'], 'subject': x['subject']})]
        print('되돌림', len(bk) - len(bad), '실패', len(bad)); return
    f = json.load(open(B + '/moves_final.json', encoding='utf-8')); rows = json.load(open(B + '/hold_order.json'))
    ids = [i for n, i in enumerate(rows, 1) if n not in SKIP]
    target = {i: {'unit': f[i]['to'], 'subject': SUB[f[i]['to']]} for i in ids}
    before = fetch(ids)
    if not os.path.exists(B + '/hold_apply_backup.json'):
        json.dump(before, open(B + '/hold_apply_backup.json', 'w', encoding='utf-8'), ensure_ascii=False)
    fail = []
    for i in ids:
        if before.get(i, {}).get('unit') == target[i]['unit'] and before[i].get('subject') == target[i]['subject']: continue
        if not patch(i, target[i]): fail.append(i)
        time.sleep(0.4)
    now = fetch(ids)
    ok = sum(now.get(i, {}).get('unit') == t['unit'] and now[i].get('subject') == t['subject'] for i, t in target.items())
    print('대상', len(ids), '· 실패', len(fail), '· 확인 일치', ok)
    print(collections.Counter((t['subject'], t['unit']) for t in target.values()).most_common(8))


if __name__ == '__main__': main()
