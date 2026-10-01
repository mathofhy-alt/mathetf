-- 시험지출제 속도 개선 (2026-10-01)
--
-- 실측(운영, 10/1):
--   · '전체' 검색          2.1~6.7초 — 자료 2,212개 규칙을 한 줄씩 대조해 4.8만 문항을 통째로 꺼낸 뒤 정렬
--   · '전체' 단원 목록     16초     — 같은 범위 계산 + 개념 태그 펼치기
--   · 유사문항 계산        0.5~3.7초 — 누를 때마다 벡터 검색(HNSW + 단원 필터)
--
-- 전체 범위에서 빠지는 문항은 약 560개뿐이다(검수 중 자료 등). 그래서 '전체'일 때는
-- 범위를 계산하지 않고 "빠지는 문항만 제외"하는 길을 따로 둔다. 빠지는 목록은 서버가 30분 캐시한다.
-- 유사문항은 결과가 문항 등록 전까지 바뀌지 않으므로 미리 계산해 표에 저장한다
-- (scripts/precompute_similar.py — 등록 배치 끝에서 새 단원만 다시 계산).
--
-- 모두 '추가'만 한다. 기존 함수·표는 건드리지 않으며, 서버 코드는 이 SQL 이 없을 때 예전 길로 동작한다.

-- 1) 범위 밖 문항 목록 — 배열 하나로 돌려줘 PostgREST 1,000행 상한을 피한다.
CREATE OR REPLACE FUNCTION public.question_bank_scope_ineligible(p_scope jsonb)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp AS $$
 SELECT coalesce(array_agg(q.id),'{}')
 FROM public.questions q
 LEFT JOIN (SELECT id FROM public.question_bank_candidates(p_scope)) c ON c.id=q.id
 WHERE q.work_status='sorted' AND c.id IS NULL;
$$;

-- 2) '전체' 검색용 후보 — question_bank_candidates 와 같은 행 모양(SETOF questions)이라
--    라우트가 같은 .select/.eq/.order/.range 를 그대로 붙인다.
--    ⚠ 제외 목록은 해시 반-조인으로 — NOT (id = ANY(배열)) 은 행마다 배열을 훑어 느리다.
CREATE OR REPLACE FUNCTION public.question_bank_all(p_excluded uuid[] DEFAULT '{}')
RETURNS SETOF public.questions LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp AS $$
 SELECT q.* FROM public.questions q
 LEFT JOIN unnest(p_excluded) AS ex(id) ON ex.id=q.id
 WHERE q.work_status='sorted' AND ex.id IS NULL;
$$;

-- 3) '전체' 단원 목록 — question_bank_facets 와 같은 결과 모양
CREATE OR REPLACE FUNCTION public.question_bank_facets_all(p_excluded uuid[] DEFAULT '{}', p_include_off boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH pool AS MATERIALIZED (
  SELECT subject,unit,is_off_curriculum,key_concepts FROM public.question_bank_all(p_excluded)
  WHERE p_include_off OR is_off_curriculum=false
 ), grouped AS (
  SELECT subject,unit,is_off_curriculum,coalesce(array_agg(DISTINCT concept) FILTER(WHERE concept IS NOT NULL),'{}') AS key_concepts
  FROM pool LEFT JOIN LATERAL unnest(key_concepts) concept ON true GROUP BY subject,unit,is_off_curriculum
 ) SELECT coalesce(jsonb_agg(to_jsonb(grouped)),'[]') FROM grouped;
$$;

-- 검색 결과 정렬(문항번호, id) 용 부분 인덱스
CREATE INDEX IF NOT EXISTS questions_sorted_qnum_id ON public.questions (question_number, id) WHERE work_status='sorted';

REVOKE ALL ON FUNCTION public.question_bank_scope_ineligible(jsonb), public.question_bank_all(uuid[]), public.question_bank_facets_all(uuid[],boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_scope_ineligible(jsonb), public.question_bank_all(uuid[]), public.question_bank_facets_all(uuid[],boolean) TO service_role;

-- 4) 유사문항 미리 계산 결과
--    neighbors = [[문항id, 유사도], ...]  (similar 는 SQL 예약어라 못 쓴다) 유사도 내림차순, 최대 50개 (유료 모드 구매 필터 여유분 = 기존 limit*5)
--    조건은 match_questions / match_questions_statement 와 같다: 같은 단원 · sorted · 자기 자신 제외 · 유사도 > 0.5
CREATE TABLE IF NOT EXISTS public.question_similar (
    question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    basis       text NOT NULL CHECK (basis IN ('solution','statement')),
    neighbors   jsonb NOT NULL,
    computed_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (question_id, basis)
);
ALTER TABLE public.question_similar ENABLE ROW LEVEL SECURITY;  -- 정책 없음 = 서비스 롤만 접근
