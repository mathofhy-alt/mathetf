"""서치콘솔 화면에서 '색인 생성 요청'을 하루 N개 누른다 (API 없음 — 화면만 가능, 하루 ~10개 한도).

대상: 분석글 사이트맵(sitemap-exam-analysis.xml)에 있는 시험지 중 GA 방문자 많은 순.
이미 요청한 주소는 index_requests.json 에 남겨 다시 안 누른다.
자동화 크롬(--remote-debugging-port=9222, C:\\selfmade\\chrome_auto_profile)이 떠 있고 서치콘솔 로그인 상태여야 한다.

  python request_index.py [개수=10] [--dry]
"""
import sys, os, re, json, time, datetime, urllib.parse
import requests
sys.path.insert(0, os.path.dirname(__file__))

HERE = os.path.dirname(os.path.abspath(__file__))
LOG = os.path.join(HERE, 'index_requests.json')
PROP = 'https://mathetf.com/'


def load_log():
    try:
        return json.load(open(LOG, encoding='utf8'))
    except Exception:
        return []


def build_queue():
    from gsc import analytics
    data, _ = analytics(interactive=False)
    locs = set(re.findall(r'<loc>(.*?)</loc>', requests.get('https://mathetf.com/sitemap-exam-analysis.xml', timeout=30).text))
    r = data.properties().runReport(property='properties/542378576', body={
        'dateRanges': [{'startDate': '60daysAgo', 'endDate': 'today'}],
        'dimensions': [{'name': 'pagePath'}], 'metrics': [{'name': 'activeUsers'}],
        'dimensionFilter': {'filter': {'fieldName': 'pagePath', 'stringFilter': {'matchType': 'BEGINS_WITH', 'value': '/exam/'}}},
        'orderBys': [{'metric': {'metricName': 'activeUsers'}, 'desc': True}], 'limit': 3000}).execute()
    q = []
    for row in r.get('rows', []):
        u = 'https://mathetf.com' + row['dimensionValues'][0]['value']
        if u in locs and u not in q:
            q.append(u)
    return q


def main():
    n = int(next((a for a in sys.argv[1:] if a.isdigit()), 10))
    dry = '--dry' in sys.argv
    log = load_log()
    done = {x['url'] for x in log if x['result'] in ('requested', 'already')}
    todo = [u for u in build_queue() if u not in done][:n]
    print('대상', len(todo))
    if dry:
        print('\n'.join(todo)); return

    from playwright.sync_api import sync_playwright
    p = sync_playwright().start()  # with 블록 종료 시 크롬이 같이 꺼졌음 — stop 안 함
    if True:
        b = p.chromium.connect_over_cdp('http://127.0.0.1:9222')
        ctx = b.contexts[0]
        pg = ctx.new_page()
        pg.set_viewport_size({'width': 1400, 'height': 900})
        for u in todo:
            # inspect?id= 는 내부 id 라 주소로 바로 못 감 — 상단 'URL 검사' 칸에 입력
            pg.goto('https://search.google.com/search-console?resource_id=' + urllib.parse.quote(PROP, safe=''))
            result = 'unknown'
            try:
                inp = pg.locator('input[aria-label*="URL 검사"]')
                inp.wait_for(timeout=30000)
                inp.click(); inp.fill(u); pg.keyboard.press('Enter')
                btn = pg.get_by_text(re.compile('색인 생성 요청|REQUEST INDEXING|Request indexing', re.I)).last
                btn.wait_for(timeout=90000)
                pg.wait_for_timeout(1500)
                btn.click()
                # 결과 대화상자: 요청됨 / 할당량 초과 / 이미 요청됨
                t0 = time.time()
                while time.time() - t0 < 180:
                    body = pg.inner_text('body')
                    if re.search('할당량 초과|Quota exceeded', body, re.I):
                        result = 'quota'; break
                    if re.search('색인 생성 요청됨|Indexing requested', body, re.I):
                        result = 'requested'; break
                    if re.search('이미.*요청|already', body, re.I):
                        result = 'already'; break
                    pg.wait_for_timeout(2000)
            except Exception as e:
                result = 'error:' + str(e)[:80]
            print(result, u, flush=True)
            log.append({'url': u, 'result': result, 'at': datetime.datetime.now().isoformat(timespec='seconds')})
            json.dump(log, open(LOG, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
            if result == 'quota':
                break
            try:
                pg.keyboard.press('Escape')
            except Exception:
                pass
            pg.wait_for_timeout(3000)
        pg.close()
        # browser.close() 는 부르지 않는다(CDP 연결이라 크롬 자체가 꺼짐)


if __name__ == '__main__':
    main()
