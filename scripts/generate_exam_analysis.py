# -*- coding: utf-8 -*-
"""
시험지 SEO 분석글 생성기 (gemini-3.5-flash).

- 대상: exam_materials 중 file_type='PDF', content_type='해설', school!='DELETED',
        ai_analysis 비어있고, source_db_id 매칭되는(=중간/기말) 시험지.
- 동작: questions(단원·난이도·개념) 집계 → 제미나이에 "데이터 근거로만, 지어내지 말고,
        시험지마다 다른 문장으로" 요청 → ai_analysis 컬럼 저장 → /exam/{id} 즉시 갱신.
- 멱등: 이미 ai_analysis 있으면 건너뜀 (--all 로 강제 재생성).
- 근거 없음(문항 데이터 0) 이면 생성 안 함 → 페이지는 템플릿으로 폴백.

사용:
    python scripts/generate_exam_analysis.py            # ai_analysis 비어있는 것 전부
    python scripts/generate_exam_analysis.py --limit 3  # 앞 3개만 (테스트)
    python scripts/generate_exam_analysis.py --all      # 전부 재생성
    python scripts/generate_exam_analysis.py --dry-run  # 생성만 하고 DB 저장/출력만 (저장 안 함)
"""
import os, re, sys, json, time
import requests

# --- 로컬 SSL 가로채기(Avast 등) 우회 — 로컬 수동 실행 & 자체 Supabase/제미나이 전용 ---
import urllib3 as _urllib3
_urllib3.disable_warnings()
_req_orig = requests.Session.request
def _req_noverify(self, *a, **k):
    k['verify'] = False
    return _req_orig(self, *a, **k)
requests.Session.request = _req_noverify

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
GEMINI_KEY = ENV['GEMINI_API_KEY']
H = {'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
SITE = (ENV.get('NEXT_PUBLIC_SITE_URL') or 'https://mathetf.com').rstrip('/')

MODEL = 'gemini-3.5-flash'
GEMINI_URL = f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={GEMINI_KEY}'

# ---- source_db_id (src/lib/examKey.ts 와 동일 규칙) ----
def build_source_db_id(row):
    et = row.get('exam_type') or ''
    sem = row.get('semester')
    if '중간' in et:
        exam_part = f'{sem}학기중간'
    elif '기말' in et:
        exam_part = f'{sem}학기기말'
    else:
        return None
    if not row.get('school') or row.get('exam_year') is None or sem is None or not row.get('subject'):
        return None
    return f"{row['school']}_{row['exam_year']}_{exam_part}_{row['subject']}"

def build_label(row):
    is_mock = row.get('exam_type') in ('모의고사', '수능')
    sem = f"{row.get('semester')}월" if is_mock else f"{row.get('semester')}학기"
    grade = f"{row.get('grade')}학년 " if row.get('grade') else ''
    subject = f" {row.get('subject')}" if row.get('subject') else ''
    return re.sub(r'\s+', ' ', f"{row.get('school')} {row.get('exam_year')}년 {grade}{sem} {row.get('exam_type') or ''}{subject}").strip()

# ---- DB ----
def fetch_targets(limit, force_all):
    params = {
        'select': 'id,school,exam_year,grade,semester,exam_type,subject,ai_analysis',
        'file_type': 'eq.PDF', 'content_type': 'eq.해설', 'school': 'neq.DELETED',
        'order': 'created_at.desc',
    }
    if not force_all:
        params['ai_analysis'] = 'is.null'
    if limit:
        params['limit'] = str(limit)
    r = requests.get(f'{URL}/rest/v1/exam_materials', headers=H, params=params, timeout=(10, 60))
    r.raise_for_status()
    return r.json()

def fetch_composition(source_db_id):
    """questions 집계 → (총문항, 단원별 [(unit,count)], 평균난이도, easy/mid/hard, 개념리스트)."""
    r = requests.get(f'{URL}/rest/v1/questions', headers=H,
                     params={'select': 'unit,difficulty,key_concepts', 'source_db_id': f'eq.{source_db_id}'},
                     timeout=(10, 60))
    r.raise_for_status()
    qs = r.json()
    if not qs:
        return None
    unit_map, concept_set = {}, []
    diff_sum = easy = mid = hard = 0
    for q in qs:
        unit = str(q.get('unit') or '기타')
        unit_map[unit] = unit_map.get(unit, 0) + 1
        d = q.get('difficulty') or 0
        try:
            d = float(d)
        except (TypeError, ValueError):
            d = 0
        diff_sum += d
        if d <= 2: easy += 1
        elif d <= 4: mid += 1
        else: hard += 1
        kc = q.get('key_concepts')
        arr = kc if isinstance(kc, list) else ([kc] if isinstance(kc, str) else [])
        for c in arr:
            t = str(c).lstrip('#').strip()
            if t and t not in concept_set:
                concept_set.append(t)
    by_unit = sorted(unit_map.items(), key=lambda x: -x[1])
    total = len(qs)
    return {
        'total': total,
        'by_unit': by_unit,
        'avg': round(diff_sum / total, 1) if total else 0,
        'easy': easy, 'mid': mid, 'hard': hard,
        'concepts': concept_set[:15],
    }

def save_analysis(row_id, text):
    from datetime import datetime, timezone
    r = requests.patch(f'{URL}/rest/v1/exam_materials',
                       headers={**H, 'Content-Type': 'application/json', 'Prefer': 'return=minimal'},
                       params={'id': f'eq.{row_id}'},
                       json={'ai_analysis': text, 'ai_analysis_at': datetime.now(timezone.utc).isoformat()},
                       timeout=(10, 60))
    if r.status_code not in (200, 204):
        raise RuntimeError(f'db patch {r.status_code}: {r.text[:200]}')

def revalidate(ids):
    if not ids:
        return
    try:
        r = requests.post(f'{SITE}/api/revalidate',
                          headers={'x-revalidate-key': KEY, 'Content-Type': 'application/json'},
                          json={'paths': [f'/exam/{i}' for i in ids]}, timeout=30)
        print(f'[즉시갱신] {len(ids)}개 페이지 {"완료" if r.status_code == 200 else f"실패 {r.status_code}"}')
    except Exception as e:
        print(f'[즉시갱신] 호출 실패: {e} (최대 1시간 뒤 자동 반영)')

# ---- 제미나이 ----
PROMPT_RULES = (
    "너는 한국 수학 내신 기출 시험지를 소개하는 SEO 에디터다. 아래 [데이터]에 있는 사실만 사용해 "
    "학생·학부모가 읽을 시험지 분석 글을 써라.\n"
    "규칙:\n"
    "1) [데이터]에 없는 내용(구체적 문항 번호, 등급컷 점수, 학교 위치·특성, 특정 킬러문항 풀이 등)은 절대 지어내지 마라.\n"
    "2) 시험지마다 문장 구조와 표현을 다르게 써라. 정해진 틀을 반복하지 마라.\n"
    "3) 3~4문단, 자연스러운 한국어 서술형. 제목·마크다운·불릿·표 없이 문단만.\n"
    "4) 단원 비중과 난이도 분포를 자연스럽게 녹이고, 마지막엔 학습 방향을 데이터 범위 안에서 한두 문장 제안하라.\n"
    "5) 과장·홍보 문구('최고의', '완벽하게' 등) 금지. 사실 위주로."
)

def build_data_block(label, comp):
    by_unit = ', '.join(f'{u}({c}문항)' for u, c in comp['by_unit'])
    concepts = ', '.join(comp['concepts']) if comp['concepts'] else '(정보 없음)'
    return (
        f"[데이터]\n"
        f"- 시험지: {label} 수학\n"
        f"- 총 문항수: {comp['total']}\n"
        f"- 단원별 문항수: {by_unit}\n"
        f"- 난이도 분포: 쉬움 {comp['easy']} / 보통 {comp['mid']} / 어려움 {comp['hard']} (10점 만점 평균 {comp['avg']})\n"
        f"- 주요 출제 개념·유형: {concepts}"
    )

def generate(label, comp):
    body = {
        'contents': [{'parts': [{'text': PROMPT_RULES + "\n\n" + build_data_block(label, comp)}]}],
        # thinkingBudget=0: 이 작업은 추론이 필요 없음. 안 끄면 thinking 토큰이 maxOutputTokens를 먹어 본문이 잘림.
        'generationConfig': {'temperature': 0.9, 'topP': 0.95, 'maxOutputTokens': 1500, 'thinkingConfig': {'thinkingBudget': 0}},
    }
    r = requests.post(GEMINI_URL, headers={'Content-Type': 'application/json'}, json=body, timeout=(10, 120))
    if r.status_code != 200:
        raise RuntimeError(f'gemini {r.status_code}: {r.text[:200]}')
    data = r.json()
    parts = data.get('candidates', [{}])[0].get('content', {}).get('parts', [])
    text = ''.join(p.get('text', '') for p in parts).strip()
    if not text:
        raise RuntimeError(f'빈 응답: {json.dumps(data)[:200]}')
    return text

# ---- 메인 ----
def main():
    limit = None
    force_all = '--all' in sys.argv
    dry = '--dry-run' in sys.argv
    if '--limit' in sys.argv:
        limit = int(sys.argv[sys.argv.index('--limit') + 1])

    targets = fetch_targets(limit, force_all)
    print(f'[대상] {len(targets)}개  (중간/기말만 · 문항 데이터 있는 것만 · gemini-3.5-flash){" · DRY-RUN" if dry else ""}\n')

    ok = skip = fail = 0
    done_ids = []
    for i, row in enumerate(targets, 1):
        label = build_label(row)
        try:
            sid = build_source_db_id(row)
            if not sid:
                skip += 1
                print(f'[{i}/{len(targets)}] SKIP (모의고사/형식불일치) {label}')
                continue
            comp = fetch_composition(sid)
            if not comp:
                skip += 1
                print(f'[{i}/{len(targets)}] SKIP (문항 데이터 없음 → 템플릿 폴백) {label}')
                continue
            text = generate(label, comp)
            if dry:
                print(f'[{i}/{len(targets)}] DRY {label}\n{"-"*60}\n{text}\n{"-"*60}')
            else:
                save_analysis(row['id'], text)
                done_ids.append(row['id'])
                print(f'[{i}/{len(targets)}] OK ({comp["total"]}문항 근거, {len(text)}자) {label}')
            ok += 1
        except Exception as e:
            fail += 1
            print(f'[{i}/{len(targets)}] FAIL {label} :: {e}')
        time.sleep(0.3)  # 제미나이 rate limit 여유

    print(f'\n완료: 성공 {ok} / 건너뜀 {skip} / 실패 {fail}')
    if not dry:
        revalidate(done_ids)

if __name__ == '__main__':
    main()
