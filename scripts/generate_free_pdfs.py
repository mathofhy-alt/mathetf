# -*- coding: utf-8 -*-
"""
회원가입 시 무료로 받는 '문제만 PDF' 생성기.

- 대상: exam_materials 중 file_type='PDF', content_type='해설'(=문제+해설 합본), school!='DELETED'
- 동작: 원본 PDF 다운로드 → (미리보기와 동일한) 문제/해설 경계 검출 → 문제 페이지만 새 PDF로 추출
        → 공개버킷(exam-free-problems)에 업로드 → free_pdf_url 저장
- 워터마크 없음(완전히 깨끗). 해설은 절대 포함 안 함(경계 검출 실패 시 안전 폴백 = 앞 N페이지).
- 멱등: 이미 free_pdf_url 채워진 행은 건너뜀 (--all 로 강제 재생성)

사용:
    python scripts/generate_free_pdfs.py            # free_pdf_url 비어있는 것 전부
    python scripts/generate_free_pdfs.py --all      # 전부 재생성
    python scripts/generate_free_pdfs.py --limit 3  # 앞 3개만 (테스트)
"""
import os, sys, time
import requests
import fitz  # PyMuPDF

# 미리보기 생성기와 동일한 환경/검출 로직 재사용 (경계 검출 일원화)
sys.path.insert(0, os.path.dirname(__file__))
from generate_previews import (
    URL, KEY, H, SRC_BUCKET, download_pdf, detect_question_page_count, revalidate_exam_pages,
)

DST_BUCKET = 'exam-free-problems'   # 무료 문제 PDF (공개)

# ---- 공개 버킷 보장 (application/pdf 허용) ----
def ensure_bucket():
    r = requests.post(f'{URL}/storage/v1/bucket', headers={**H, 'Content-Type': 'application/json'},
                      json={'id': DST_BUCKET, 'name': DST_BUCKET, 'public': True,
                            'allowed_mime_types': ['application/pdf'], 'file_size_limit': 26214400})
    if r.status_code in (200, 201):
        print(f'[bucket] 공개버킷 생성: {DST_BUCKET}')
    elif r.status_code == 409 or 'already exists' in r.text.lower() or 'Duplicate' in r.text:
        print(f'[bucket] 이미 존재: {DST_BUCKET}')
    else:
        print(f'[bucket] 응답 {r.status_code}: {r.text[:200]}')

def upload_pdf(name, data):
    r = requests.post(f'{URL}/storage/v1/object/{DST_BUCKET}/{name}',
                      headers={**H, 'Content-Type': 'application/pdf', 'x-upsert': 'true'}, data=data)
    if r.status_code not in (200, 201):
        raise RuntimeError(f'upload {r.status_code}: {r.text[:200]}')
    return f'{URL}/storage/v1/object/public/{DST_BUCKET}/{name}'

# ---- DB ----
def fetch_targets(limit, force_all):
    params = {
        'select': 'id,file_path,school,exam_year,grade,semester,exam_type,subject,free_pdf_url',
        'file_type': 'eq.PDF', 'content_type': 'eq.해설', 'school': 'neq.DELETED',
        'order': 'created_at.desc',
    }
    if not force_all:
        params['free_pdf_url'] = 'is.null'
    if limit:
        params['limit'] = str(limit)
    r = requests.get(f'{URL}/rest/v1/exam_materials', headers=H, params=params)
    r.raise_for_status()
    return r.json()

def save_url(row_id, url):
    r = requests.patch(f'{URL}/rest/v1/exam_materials',
                       headers={**H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                       params={'id': f'eq.{row_id}'}, json={'free_pdf_url': url})
    if r.status_code not in (200, 204):
        raise RuntimeError(f'db patch {r.status_code}: {r.text[:200]}')

# ---- 문제만 PDF 추출 ----
def build_question_pdf(doc, qcount) -> bytes:
    out = fitz.open()
    out.insert_pdf(doc, from_page=0, to_page=qcount - 1)
    data = out.tobytes(garbage=4, deflate=True)  # 압축 저장
    out.close()
    return data

def main():
    limit = None
    force_all = '--all' in sys.argv
    if '--limit' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])

    ensure_bucket()
    targets = fetch_targets(limit, force_all)
    print(f'[대상] {len(targets)}개  (문제만 PDF / 해설 제외 / 워터마크 없음)\n')

    ok = fail = 0
    done_ids = []
    for i, row in enumerate(targets, 1):
        label = f"{row.get('school')} {row.get('exam_year')} {row.get('grade')} {row.get('semester')} {row.get('exam_type')} {row.get('subject')}"
        try:
            pdf = download_pdf(row['file_path'])
            doc = fitz.open(stream=pdf, filetype='pdf')
            total = len(doc)
            qcount = detect_question_page_count(doc)   # 미리보기와 동일 경계 (못 찾으면 안전 폴백)
            data = build_question_pdf(doc, qcount)
            doc.close()
            url = upload_pdf(f"{row['id']}_q.pdf", data)   # 스토리지 키는 ASCII만 (한글 불가)
            save_url(row['id'], url)
            done_ids.append(row['id'])
            ok += 1
            print(f'[{i}/{len(targets)}] OK ({qcount}p / 총{total}p) {label}')
        except Exception as e:
            fail += 1
            print(f'[{i}/{len(targets)}] FAIL {label} :: {e}')
        time.sleep(0.05)

    print(f'\n완료: 성공 {ok} / 실패 {fail}')
    revalidate_exam_pages(done_ids)   # 생성된 시험지 페이지만 즉시 갱신

if __name__ == '__main__':
    main()
