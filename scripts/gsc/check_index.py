"""색인 요청했던 주소들이 구글에 색인됐는지 URL 검사 API 로 확인하고 일일 보고서(HTML)를 만든다.

request_index_daily.ps1 가 매일 요청 10개 다음에 부른다.
  - 기록: index_status.json  {url: {first_indexed, last_state, last_crawl, checked_at}}
  - 보고서: reports/index_report_YYYY-MM-DD.html (+ reports/latest.html)
"""
import sys, os, json, datetime, html
sys.path.insert(0, os.path.dirname(__file__))

HERE = os.path.dirname(os.path.abspath(__file__))
REQ = os.path.join(HERE, 'index_requests.json')
ST = os.path.join(HERE, 'index_status.json')
OUT = os.path.join(HERE, 'reports')
PROP = 'https://mathetf.com/'

STATE_KO = {
    'Submitted and indexed': '색인됨',
    'Indexed, not submitted in sitemap': '색인됨',
    'Crawled - currently not indexed': '크롤됨·색인 안 됨',
    'Discovered - currently not indexed': '발견됨·크롤 안 됨',
    'URL is unknown to Google': '구글이 모름',
}


def load(p, d):
    try:
        return json.load(open(p, encoding='utf8'))
    except Exception:
        return d


def main():
    today = datetime.date.today().isoformat()
    now = datetime.datetime.now().isoformat(timespec='seconds')
    reqs = load(REQ, [])
    st = load(ST, {})
    os.makedirs(OUT, exist_ok=True)

    asked = {}
    for x in reqs:
        if x['result'] in ('requested', 'already'):
            asked.setdefault(x['url'], x['at'][:10])
    today_req = [x for x in reqs if x['at'][:10] == today]

    err = None
    rows = []
    try:
        from gsc import service
        svc = service(interactive=False)
        for u, day in asked.items():
            try:
                r = svc.urlInspection().index().inspect(body={'inspectionUrl': u, 'siteUrl': PROP}).execute()
                ir = r['inspectionResult']['indexStatusResult']
                cov = ir.get('coverageState', '?')
                crawl = (ir.get('lastCrawlTime') or '')[:10]
                ok = ir.get('verdict') == 'PASS'
            except Exception as e:
                cov, crawl, ok = '조회 오류: ' + str(e)[:60], '', False
            s = st.setdefault(u, {})
            if ok and not s.get('first_indexed'):
                s['first_indexed'] = today
            s.update(last_state=cov, last_crawl=crawl, checked_at=now, requested=day)
            rows.append((u, day, cov, crawl, ok, s.get('first_indexed')))
        json.dump(st, open(ST, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
    except Exception as e:
        err = str(e)

    n_ok = sum(1 for r in rows if r[4])
    new_ok = [r for r in rows if r[5] == today]
    crawled_after = sum(1 for r in rows if r[3] and r[3] >= r[1])
    req_ok = sum(1 for x in today_req if x['result'] in ('requested', 'already'))
    quota = any(x['result'] == 'quota' for x in today_req)
    req_err = [x for x in today_req if x['result'].startswith('error') or x['result'] == 'unknown']

    lines = []
    lines.append(f'<h1>구글 색인 보고 {today}</h1>')
    lines.append('<ul>')
    lines.append(f'<li>오늘 요청: <b>{req_ok}개</b>' + (' (할당량 초과로 중단)' if quota else '')
                 + (f' · 실패 {len(req_err)}개' if req_err else '') + ('' if today_req else ' — <b>오늘 요청 실행 안 됨</b>') + '</li>')
    if err:
        lines.append(f'<li style="color:#c00">색인 확인 실패: {html.escape(err)} — 사장에게 「서치콘솔 재로그인」이라고 말해 주세요</li>')
    else:
        lines.append(f'<li>지금까지 요청 <b>{len(rows)}개</b> 중 색인됨 <b>{n_ok}개</b>'
                     f' · 요청 뒤 구글이 다녀감 {crawled_after}개</li>')
        lines.append(f'<li>오늘 새로 색인된 것: <b>{len(new_ok)}개</b></li>')
    lines.append('</ul>')
    if rows:
        lines.append('<table><tr><th>요청일</th><th>상태</th><th>마지막 크롤</th><th>주소</th></tr>')
        for u, day, cov, crawl, ok, first in sorted(rows, key=lambda r: (not r[4], r[1]), reverse=False):
            label = STATE_KO.get(cov, cov)
            if ok and first:
                label += f' ({first}~)'
            color = '#0a7d32' if ok else ('#b26a00' if crawl and crawl >= day else '#666')
            lines.append(f'<tr><td>{day}</td><td style="color:{color}"><b>{html.escape(label)}</b></td>'
                         f'<td>{crawl or "-"}</td><td><a href="{u}">{u.rsplit("/", 1)[-1][:8]}</a></td></tr>')
        lines.append('</table>')
    doc = ('<!doctype html><meta charset="utf-8"><title>색인 보고 ' + today + '</title>'
           '<style>body{font-family:"Malgun Gothic",sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#222;background:#fff}'
           'table{border-collapse:collapse;width:100%;font-size:14px}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}</style>'
           + '\n'.join(lines))
    p = os.path.join(OUT, f'index_report_{today}.html')
    open(p, 'w', encoding='utf8').write(doc)
    open(os.path.join(OUT, 'latest.html'), 'w', encoding='utf8').write(doc)
    print(f'요청 {req_ok} / 누적 {len(rows)} 중 색인 {n_ok} / 오늘 새로 {len(new_ok)}' + (f' / 오류 {err}' if err else ''))
    print(p)


if __name__ == '__main__':
    main()
