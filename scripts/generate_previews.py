# -*- coding: utf-8 -*-
"""
시험지 '문제 앞 1~2페이지' 워터마크 미리보기 생성기.

- 대상: exam_materials 중 file_type='PDF', content_type='해설'(=문제+해설 합본), school!='DELETED'
- 동작: PDF 다운로드 → 앞 2페이지(문제) 렌더 + 'mathetf.com' 워터마크 → 공개버킷 업로드 → preview_urls 저장
- 멱등: 이미 preview_urls 채워진 행은 건너뜀 (--all 로 강제 재생성)

사용:
    python scripts/generate_previews.py            # preview_urls 비어있는 것 전부
    python scripts/generate_previews.py --limit 3  # 앞 3개만 (테스트)
    python scripts/generate_previews.py --no-db     # DB저장 생략(업로드 확인용, 마이그레이션 전 테스트)
"""
import io, os, re, sys, json, time
import requests
import fitz  # PyMuPDF
from PIL import Image, ImageDraw, ImageFont

# --- 로컬 SSL 가로채기(Avast 백신 등) 우회 ---
# 이 스크립트는 로컬 PC에서만 수동 실행되고 자체 Supabase에만 접속한다.
# Avast HTTPS 검사가 인증서를 가로채 requests 가 실패하므로 검증을 끈다.
import urllib3 as _urllib3
_urllib3.disable_warnings()
_req_orig = requests.Session.request
def _req_noverify(self, *a, **k):
    k['verify'] = False
    return _req_orig(self, *a, **k)
requests.Session.request = _req_noverify

# ---- 환경변수 (.env.local) ----
def load_env():
    env = {}
    path = os.path.join(os.path.dirname(__file__), '..', '.env.local')
    with open(path, encoding='utf-8') as f:
        for line in f:
            m = re.match(r'^\s*([\w.-]+)\s*=\s*(.*)\s*$', line)
            if m:
                env[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return env

ENV = load_env()
URL = ENV['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
KEY = ENV['SUPABASE_SERVICE_ROLE_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
SITE = (ENV.get('NEXT_PUBLIC_SITE_URL') or 'https://mathetf.com').rstrip('/')

SRC_BUCKET = 'exam-materials'   # 원본 PDF (비공개)
DST_BUCKET = 'exam-previews'    # 미리보기 (공개)
FALLBACK_PAGES = 2              # [안전] 해설 경계 검출 실패 시 앞 N페이지만 공개 (해설 유출 방지)
MAX_QUESTION_PAGES = 15         # 문제 페이지 상한 (이상 동작 방지)
RENDER_SCALE = 1.5
WEBP_QUALITY = 80
WATERMARK_ALPHA = 38           # 워터마크 농도(0~255). 38=아주 흐림
# 해설 시작 페이지 판별 키워드 (이 중 하나라도 그 페이지에 나오면 해설로 간주)
SOLUTION_KEYWORDS = ['따라서 정답', '정답 및 풀이', '정답과 해설', '[정답]', '정답]', '해설]', '풀이]', '빠른 정답', '정답표', '채점기준']

def detect_question_page_count(doc) -> int:
    """문제 페이지 수 반환. 해설 시작(정확 키워드 OR 정답/해설/풀이 밀도≥3) 중 가장 이른 페이지
    앞까지를 문제로 본다 (이른 신호 채택 = 해설 누출 방지). 못 찾으면 FALLBACK_PAGES."""
    n = len(doc)
    for i in range(n):
        try:
            txt = doc[i].get_text()
        except Exception:
            txt = ''
        density = txt.count('정답') + txt.count('해설') + txt.count('풀이')
        if any(kw in txt for kw in SOLUTION_KEYWORDS) or density >= 3:
            return max(1, min(i, MAX_QUESTION_PAGES))  # 0..i-1 이 문제 → 개수 i
    return min(FALLBACK_PAGES, n)

# ---- 공개 버킷 보장 ----
def ensure_bucket():
    r = requests.post(f'{URL}/storage/v1/bucket', headers={**H, 'Content-Type': 'application/json'},
                      json={'id': DST_BUCKET, 'name': DST_BUCKET, 'public': True,
                            'allowed_mime_types': ['image/webp'], 'file_size_limit': 5242880})
    if r.status_code in (200, 201):
        print(f'[bucket] 공개버킷 생성: {DST_BUCKET}')
    elif r.status_code == 409 or 'already exists' in r.text.lower() or 'Duplicate' in r.text:
        print(f'[bucket] 이미 존재: {DST_BUCKET}')
    else:
        print(f'[bucket] 응답 {r.status_code}: {r.text[:200]}')

# ---- 워터마크 ----
def make_watermark_tile(font):
    tile = Image.new('RGBA', (340, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.text((8, 40), 'mathetf.com', font=font, fill=(135, 145, 160, WATERMARK_ALPHA))
    return tile.rotate(30, expand=1)

def render_page(doc, page_idx, wm_tile=None):
    if page_idx >= len(doc):
        return None
    pix = doc[page_idx].get_pixmap(matrix=fitz.Matrix(RENDER_SCALE, RENDER_SCALE))
    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    if wm_tile is not None:
        img = img.convert('RGBA')
        W, Hh = img.size
        overlay = Image.new('RGBA', (W, Hh), (0, 0, 0, 0))
        tw, th = wm_tile.size
        for y in range(-th, Hh + th, int(th * 0.9)):
            for x in range(-tw, W + tw, int(tw * 0.95)):
                overlay.alpha_composite(wm_tile, (x, y))
        img = Image.alpha_composite(img, overlay)
    out = img.convert('RGB')
    buf = io.BytesIO()
    out.save(buf, 'WEBP', quality=WEBP_QUALITY)
    return buf.getvalue()

# ---- 스토리지 ----
def download_pdf(file_path):
    r = requests.get(f'{URL}/storage/v1/object/{SRC_BUCKET}/{file_path}', headers=H)
    r.raise_for_status()
    return r.content

def upload_preview(name, data):
    r = requests.post(f'{URL}/storage/v1/object/{DST_BUCKET}/{name}',
                      headers={**H, 'Content-Type': 'image/webp', 'x-upsert': 'true'}, data=data)
    if r.status_code not in (200, 201):
        raise RuntimeError(f'upload {r.status_code}: {r.text[:200]}')
    return f'{URL}/storage/v1/object/public/{DST_BUCKET}/{name}'

# ---- DB ----
def fetch_targets(limit, force_all, no_db=False):
    # no_db(마이그레이션 전 테스트) 일 때는 preview_urls 컬럼을 참조하지 않음
    sel = 'id,file_path,school,exam_year,grade,semester,exam_type,subject'
    if not no_db:
        sel += ',preview_urls'
    params = {
        'select': sel,
        'file_type': 'eq.PDF', 'content_type': 'eq.해설', 'school': 'neq.DELETED',
        'order': 'created_at.desc',
    }
    if not force_all and not no_db:
        params['preview_urls'] = 'is.null'
    if limit:
        params['limit'] = str(limit)
    r = requests.get(f'{URL}/rest/v1/exam_materials', headers=H, params=params)
    r.raise_for_status()
    return r.json()

def save_urls(row_id, urls):
    r = requests.patch(f'{URL}/rest/v1/exam_materials', headers={**H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                       params={'id': f'eq.{row_id}'}, json={'preview_urls': urls})
    if r.status_code not in (200, 204):
        raise RuntimeError(f'db patch {r.status_code}: {r.text[:200]}')

def revalidate_exam_pages(ids):
    """생성한 시험지 상세페이지(/exam/{id})만 즉시 갱신 (ISR 1시간 안 기다림)."""
    if not ids:
        return
    paths = [f'/exam/{i}' for i in ids]
    try:
        r = requests.post(f'{SITE}/api/revalidate',
                          headers={'x-revalidate-key': KEY, 'Content-Type': 'application/json'},
                          json={'paths': paths}, timeout=30)
        if r.status_code == 200:
            print(f'[즉시갱신] {len(paths)}개 시험지 페이지 갱신 완료 ({SITE})')
        else:
            print(f'[즉시갱신] 실패 {r.status_code}: {r.text[:150]} (배포 안됐거나 키 불일치 — 최대 1시간 뒤 자동 반영됨)')
    except Exception as e:
        print(f'[즉시갱신] 호출 실패: {e} (최대 1시간 뒤 자동 반영됨)')

# ---- 메인 ----
def main():
    limit = None
    no_db = '--no-db' in sys.argv
    force_all = '--all' in sys.argv
    if '--limit' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])

    # 워터마크 기본 ON (아주 흐림). --no-watermark 로 끌 수 있음.
    wm_tile = None
    if '--no-watermark' not in sys.argv:
        try:
            font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 30)
        except Exception:
            font = ImageFont.load_default()
        wm_tile = make_watermark_tile(font)

    ensure_bucket()
    targets = fetch_targets(limit, force_all, no_db)
    print(f'[대상] {len(targets)}개  (문제 전체 공개 / 해설 자동 제외 / 워터마크 {"ON" if wm_tile else "OFF"})\n')

    ok = fail = 0
    done_ids = []
    for i, row in enumerate(targets, 1):
        label = f"{row.get('school')} {row.get('exam_year')} {row.get('grade')} {row.get('semester')} {row.get('exam_type')} {row.get('subject')}"
        try:
            pdf = download_pdf(row['file_path'])
            doc = fitz.open(stream=pdf, filetype='pdf')
            total = len(doc)
            qcount = detect_question_page_count(doc)   # 해설 앞까지 (못 찾으면 안전 폴백)
            urls = []
            for p in range(qcount):
                data = render_page(doc, p, wm_tile)
                if data is None:
                    break
                url = upload_preview(f"{row['id']}_p{p+1}.webp", data)
                urls.append(url)
            doc.close()
            if not urls:
                raise RuntimeError('렌더 페이지 없음')
            if not no_db:
                save_urls(row['id'], urls)
                done_ids.append(row['id'])
            ok += 1
            print(f'[{i}/{len(targets)}] OK ({len(urls)}p / 총{total}p) {label}')
        except Exception as e:
            fail += 1
            print(f'[{i}/{len(targets)}] FAIL {label} :: {e}')
        time.sleep(0.05)

    print(f'\n완료: 성공 {ok} / 실패 {fail}')
    if no_db:
        print('(--no-db: DB 미저장. 마이그레이션 후 다시 실행하면 preview_urls 채워짐)')
    else:
        revalidate_exam_pages(done_ids)   # 생성된 시험지 페이지만 즉시 갱신

if __name__ == '__main__':
    main()
