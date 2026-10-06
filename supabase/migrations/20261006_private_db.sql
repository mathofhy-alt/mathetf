-- 회원 전용 개인DB (2026-10-06)
-- 개인DB 요청으로 받은 시중 교재를 운영자가 DB 로 만들어 그 회원에게만 판다. 코드: src/lib/questions/privateDb.ts
--  · 상품은 공개 자료표(exam_materials)가 아니라 private_dbs 에 둔다 — 공개 페이지·사이트맵이 exam_materials 를 읽는다.
--  · 문항은 work_status='private' — 전체검색·유사문항·예상문제·프린트변형·사다리·통계는 전부 'sorted' 만 읽는다.
--  · 출제 범위(question_bank_candidates)는 sources 로 '직접' 지정된 private 문항만 낸다. 그 sources 는 서버가
--    결제한 주인의 범위에만 넣는다(privateCatalog).

-- 1) 상품 표
CREATE TABLE IF NOT EXISTS public.private_dbs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES auth.users(id),
    request_id uuid REFERENCES public.db_requests(id) ON DELETE SET NULL,
    title text NOT NULL,
    source_db_id text NOT NULL UNIQUE,
    subject text,
    grade text,
    price integer NOT NULL CHECK (price >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS private_dbs_owner_idx ON public.private_dbs (owner_user_id);
ALTER TABLE public.private_dbs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.private_dbs FROM anon, authenticated;   -- 서버(service role)만

-- 2) 출제 범위: sorted 문항 + (범위에 sources 로 지정된) private 문항
CREATE OR REPLACE FUNCTION public.question_bank_candidates(p_scope jsonb,p_excluded uuid[] DEFAULT '{}')
RETURNS SETOF public.questions LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp AS $$
 WITH rules AS MATERIALIZED (
  SELECT * FROM jsonb_to_recordset(p_scope) AS r(sources text[],school text,grade text,year text,semesters text[],"semesterPrefix" text,subjects text[])
 ), eligible AS (
  SELECT q.id, true AS by_source FROM public.questions q JOIN rules r ON q.source_db_id=ANY(r.sources) AND (r.grade IS NULL OR q.grade::text=r.grade)
  UNION
  SELECT q.id, false FROM public.questions q JOIN rules r ON q.school=r.school
  WHERE r.sources IS NULL AND (r.grade IS NULL OR q.grade::text=r.grade)
    AND (r.year IS NULL OR q.year::text=r.year)
    AND (r.semesters IS NULL OR q.semester=ANY(r.semesters))
    AND (r."semesterPrefix" IS NULL OR starts_with(q.semester,r."semesterPrefix"))
    AND (r.subjects IS NULL OR q.subject=ANY(r.subjects))
 ), merged AS (SELECT id, bool_or(by_source) AS by_source FROM eligible GROUP BY id)
 SELECT q.* FROM public.questions q JOIN merged e ON q.id=e.id
 WHERE (q.work_status='sorted' OR (q.work_status='private' AND e.by_source)) AND NOT(q.id=ANY(p_excluded));
$$;
REVOKE ALL ON FUNCTION public.question_bank_candidates(jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_candidates(jsonb,uuid[]) TO service_role;

-- 3) 회원이 anon 키로 직접 읽는 길(RLS)에서도 전용 문항을 막는다
DROP POLICY IF EXISTS "questions_select_authenticated" ON public.questions;
CREATE POLICY "questions_select_authenticated"
  ON public.questions FOR SELECT
  USING (auth.role() = 'authenticated' AND work_status IS DISTINCT FROM 'private');

-- ⚠ 정책 안의 하위 조회에도 questions RLS 가 걸려 private 행이 '안 보임' → NOT EXISTS 가 참이 되어 그림이 열린다.
--   그래서 RLS 를 우회하는 판정 함수로 본다.
CREATE OR REPLACE FUNCTION public.question_is_private(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.questions WHERE id=p_id AND work_status='private');
$$;
REVOKE ALL ON FUNCTION public.question_is_private(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.question_is_private(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "question_images_select_authenticated" ON public.question_images;
CREATE POLICY "question_images_select_authenticated"
  ON public.question_images FOR SELECT
  USING (auth.role() = 'authenticated' AND NOT public.question_is_private(question_id));
