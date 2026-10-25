# -*- coding: utf-8 -*-
"""한글 → PDF 변환 일꾼 (2026-10-25) — 아이윈브 윈도우 서버(seoul-exam-server, 한글 2022)에서 돈다.

  pythonw worker.py            (작업 스케줄러 「로그온할 때」로 시작, C:\\pdfworker\\worker.log)

사이트가 pdf_jobs 에 pending 을 넣고 저장소 pdf-jobs/<id>.hml 을 올리면, 1.5초마다 하나 가져가
한글로 열어 PDF 로 저장해 pdf-jobs/<id>.pdf 로 올리고 done 으로 적는다. 서버는 문을 열지 않는다(밖으로만 나감).
- 한글은 켜 둔 채 돌려쓴다(켜는 데 3초). 오류가 나면 다시 띄운다.
- 보안 모듈: HKCU\\SOFTWARE\\HNC\\HwpAutomation\\Modules\\FilePathCheckerModule = pyhwpx 의 DLL(10/25 등록).
- 열쇠: C:\\pdfworker\\config.json {"url": 수파베이스 주소, "key": 서비스 키} — 이 파일은 저장소에 올리지 않는다.
- 하루 지난 hml/pdf 는 지운다.
"""
import datetime, json, os, sys, time, traceback, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, 'config.json'), encoding='utf-8'))
U, K = CFG['url'].rstrip('/'), CFG['key']
H = {'apikey': K, 'Authorization': 'Bearer ' + K}
WORK = os.path.join(HERE, 'work'); os.makedirs(WORK, exist_ok=True)
LOG = os.path.join(HERE, 'worker.log')
NAME = os.environ.get('COMPUTERNAME', 'iwinv')


def log(*a):
    line = datetime.datetime.now().strftime('%m/%d %H:%M:%S ') + ' '.join(map(str, a))
    with open(LOG, 'a', encoding='utf-8') as f: f.write(line + '\n')


def http(method, path, body=None, headers=None, raw=False, timeout=60):
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    r = urllib.request.Request(U + path, data=data, method=method, headers={**H, **(headers or {})})
    with urllib.request.urlopen(r, timeout=timeout) as f:
        t = f.read()
        return t if raw else (json.loads(t) if t.strip() else None)


def patch(job_id, fields, cond=''):
    return http('PATCH', f'/rest/v1/pdf_jobs?id=eq.{job_id}{cond}', fields, {'Content-Type': 'application/json', 'Prefer': 'return=representation'})


_hwp = None
def hwp():
    global _hwp
    if _hwp is None:
        import win32com.client as wc
        _hwp = wc.Dispatch('HWPFrame.HwpObject')
        _hwp.RegisterModule('FilePathCheckDLL', 'FilePathCheckerModule')
        try: _hwp.XHwpWindows.Item(0).Visible = False
        except Exception: pass
    return _hwp


def reset_hwp():
    global _hwp
    try: _hwp.Quit()
    except Exception: pass
    _hwp = None
    os.system('taskkill /F /IM Hwp.exe >NUL 2>&1')


def convert(src, dst):
    h = hwp()
    if not h.Open(src, 'HWPML2X', 'forceopen:true'): raise RuntimeError('한글이 파일을 열지 못함')
    try:
        pages = h.PageCount
        if not h.SaveAs(dst, 'PDF', ''): raise RuntimeError('PDF 저장 실패')
    finally:
        h.Clear(1)
    return pages


BRAND = (0x49 / 255, 0x7A / 255, 0xB7 / 255)   # 브랜드 파랑 #497AB7


def stamp(path):
    """[10/25 대표] 무료 회원 PDF 에 로고 — 오른쪽 위 맨 끝 여백에 '수학ETF', 맨 아래 가운데(쪽 번호 아래)에 'mathetf.com'.
    한글 시험지 머리(제목·날짜·쪽 번호)는 위에서 44pt 아래부터, 쪽 번호는 아래에서 40pt 위라 그 바깥 여백에 찍는다."""
    import fitz
    doc = fitz.open(path)
    for pg in doc:
        w, h = pg.rect.width, pg.rect.height
        s1 = 14   # '수학'은 한글 글꼴, 'ETF'는 영문 굵은 글꼴 — 한글 글꼴로 영문을 쓰면 'E T F' 로 벌어진다
        w_ko, w_en = fitz.get_text_length('수학', fontname='korea', fontsize=s1), fitz.get_text_length('ETF', fontname='hebo', fontsize=s1)
        x = w - 48 - w_ko - w_en
        pg.insert_text((x, 32), '수학', fontname='korea', fontsize=s1, color=BRAND)
        pg.insert_text((x + w_ko + 1, 32), 'ETF', fontname='hebo', fontsize=s1, color=BRAND)
        t2, s2 = 'mathetf.com', 9
        pg.insert_text(((w - fitz.get_text_length(t2, fontname='helv', fontsize=s2)) / 2, h - 16), t2, fontname='helv', fontsize=s2, color=(0.45, 0.45, 0.45))
    doc.saveIncr() if doc.can_save_incrementally() else None
    doc.close()


def one():
    rows = http('GET', '/rest/v1/pdf_jobs?select=id,stamp&status=eq.pending&order=created_at&limit=1')
    if not rows: return False
    jid = rows[0]['id']
    got = patch(jid, {'status': 'working', 'started_at': 'now', 'worker': NAME}, '&status=eq.pending')   # 먼저 잡은 쪽만
    if not got: return True
    t0 = time.time(); src = os.path.join(WORK, jid + '.hml'); dst = os.path.join(WORK, jid + '.pdf')
    try:
        open(src, 'wb').write(http('GET', f'/storage/v1/object/pdf-jobs/{jid}.hml', raw=True, timeout=120))
        try: pages = convert(src, dst)
        except Exception:
            reset_hwp(); pages = convert(src, dst)            # 한글이 죽었으면 한 번 다시
        if rows[0].get('stamp', True): stamp(dst)
        http('POST', f'/storage/v1/object/pdf-jobs/{jid}.pdf', open(dst, 'rb').read(),
             {'Content-Type': 'application/pdf', 'x-upsert': 'true'}, timeout=120)
        sec = round(time.time() - t0, 1)
        patch(jid, {'status': 'done', 'done_at': 'now', 'pages': pages, 'sec': sec})
        log('완료', jid, pages, '쪽', sec, '초')
    except Exception as e:
        log('실패', jid, repr(e)[:300]); log(traceback.format_exc()[-800:])
        try: patch(jid, {'status': 'error', 'done_at': 'now', 'error': repr(e)[:300]})
        except Exception: pass
        reset_hwp()
    finally:
        for p in (src, dst):
            try: os.remove(p)
            except OSError: pass
    return True


def cleanup():
    """하루 지난 저장소 파일 지우기(하루 한 번)"""
    try:
        old = http('GET', '/rest/v1/pdf_jobs?select=id&created_at=lt.' + (datetime.datetime.utcnow() - datetime.timedelta(days=1)).strftime('%Y-%m-%dT%H:%M:%S') + '&order=created_at.desc&limit=500')
        names = [f'{r["id"]}.{x}' for r in old or [] for x in ('hml', 'pdf')]
        if names: http('DELETE', '/storage/v1/object/pdf-jobs', {'prefixes': names}, {'Content-Type': 'application/json'})
    except Exception as e:
        log('정리 실패', repr(e)[:200])


def main():
    import pythoncom
    pythoncom.CoInitialize()
    log('시작', NAME)
    last_clean = 0
    while True:
        try:
            busy = one()
        except urllib.error.URLError as e:
            log('연결 오류', repr(e)[:200]); busy = False; time.sleep(10)
        except Exception as e:
            log('오류', repr(e)[:300]); busy = False; time.sleep(5)
        if time.time() - last_clean > 86400: cleanup(); last_clean = time.time()
        if not busy: time.sleep(1.5)


if __name__ == '__main__':
    main()
