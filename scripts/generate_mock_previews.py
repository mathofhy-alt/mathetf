# -*- coding: utf-8 -*-
"""
모의고사 자료실 미리보기 생성기 (워터마크 없음).

- 대상: mock_exams 중 original_pdf_path 있고 preview_urls 비어있는 행
- 동작: 원본 PDF(비공개 mock-materials) 다운로드 → 앞 N페이지 렌더(워터마크 X) → 공개 mock-previews 업로드 → preview_urls 저장
- 멱등: 이미 preview_urls 있으면 건너뜀 (--all 로 강제 재생성)

사용:
    python scripts/generate_mock_previews.py
    python scripts/generate_mock_previews.py --all
    python scripts/generate_mock_previews.py --pages 5
"""
import io, os, re, sys, time
import requests
import fitz  # PyMuPDF
from PIL import Image

# Avast SSL 가로채기 우회 (로컬 수동 실행 전용)
import urllib3 as _u; _u.disable_warnings()
_o = requests.Session.request
requests.Session.request = lambda self, *a, **k: _o(self, *a, **{**k, 'verify': False})

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

SRC_BUCKET = 'mock-materials'   # 원본 (비공개)
DST_BUCKET = 'mock-previews'    # 미리보기 (공개)
DEFAULT_PAGES = 3               # 미리보기로 노출할 앞 페이지 수
RENDER_SCALE = 1.6
WEBP_QUALITY = 82

def render_page(doc, idx):
    if idx >= len(doc):
        return None
    pix = doc[idx].get_pixmap(matrix=fitz.Matrix(RENDER_SCALE, RENDER_SCALE))
    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=WEBP_QUALITY)
    return buf.getvalue()

def download(path):
    r = requests.get(f'{URL}/storage/v1/object/{SRC_BUCKET}/{path}', headers=H)
    r.raise_for_status()
    return r.content

def upload(name, data):
    # cache-control: CDN 캐시 활성화 (generate_previews.py와 동일 — 30일)
    r = requests.post(f'{URL}/storage/v1/object/{DST_BUCKET}/{name}',
                      headers={**H, 'Content-Type': 'image/webp', 'x-upsert': 'true',
                               'cache-control': 'max-age=2592000'}, data=data)
    if r.status_code not in (200, 201):
        raise RuntimeError(f'upload {r.status_code}: {r.text[:200]}')
    return f'{URL}/storage/v1/object/public/{DST_BUCKET}/{name}'

def fetch_targets(force_all):
    params = {'select': 'id,slug,title,original_pdf_path,preview_urls',
              'original_pdf_path': 'not.is.null', 'order': 'created_at.desc'}
    if not force_all:
        params['preview_urls'] = 'is.null'
    r = requests.get(f'{URL}/rest/v1/mock_exams', headers=H, params=params)
    r.raise_for_status()
    return r.json()

def save_urls(row_id, urls):
    r = requests.patch(f'{URL}/rest/v1/mock_exams',
                       headers={**H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                       params={'id': f'eq.{row_id}'}, json={'preview_urls': urls})
    if r.status_code not in (200, 204):
        raise RuntimeError(f'db patch {r.status_code}: {r.text[:200]}')

def main():
    force_all = '--all' in sys.argv
    pages = DEFAULT_PAGES
    if '--pages' in sys.argv:
        pages = int(sys.argv[sys.argv.index('--pages') + 1])

    targets = fetch_targets(force_all)
    print(f'[대상] {len(targets)}개 (앞 {pages}p, 워터마크 없음)\n')
    ok = fail = 0
    for i, row in enumerate(targets, 1):
        try:
            pdf = download(row['original_pdf_path'])
            doc = fitz.open(stream=pdf, filetype='pdf')
            urls = []
            for p in range(min(pages, len(doc))):
                data = render_page(doc, p)
                if data is None:
                    break
                urls.append(upload(f"{row['id']}_p{p+1}.webp", data))
            doc.close()
            if not urls:
                raise RuntimeError('렌더 페이지 없음')
            save_urls(row['id'], urls)
            ok += 1
            print(f"[{i}/{len(targets)}] OK ({len(urls)}p) {row['title']}")
        except Exception as e:
            fail += 1
            print(f"[{i}/{len(targets)}] FAIL {row['title']} :: {e}")
        time.sleep(0.05)
    print(f'\n완료: 성공 {ok} / 실패 {fail}')

if __name__ == '__main__':
    main()
