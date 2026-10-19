-- 문항 유형 체계 (2026-10-19) — 시험지출제 '단원 → 유형 → 난이도' 정렬과 유형 머리줄
-- 유형 안: C:\mathetf_types\NN_단원\types.json (코덱스 조사·합본, 대표 검토), 문항 배정: assign.json (코덱스 배정)
-- 데이터는 이 SQL 실행 뒤 scripts/types/load_types.py 가 서비스 롤로 넣는다. 기존 검색 함수·questions 표는 바꾸지 않는다.

-- 1) 단원별 유형 목록
CREATE TABLE IF NOT EXISTS public.question_type_defs (
    unit    text NOT NULL,
    code    text NOT NULL,              -- T01, T02 …
    name    text NOT NULL,              -- 화면 머리줄 이름
    what    text,                       -- 무엇을 묻고 어떻게 푸는가 한 줄
    ord     int  NOT NULL,              -- 단원 안 순서(교과서 진도 순)
    offcur  boolean NOT NULL DEFAULT false,   -- 교과외 유형(외분점·부등식의 영역·역행렬 등)
    PRIMARY KEY (unit, code)
);

-- 2) 문항별 대표 유형 하나
CREATE TABLE IF NOT EXISTS public.question_types (
    question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
    unit        text NOT NULL,
    code        text NOT NULL,
    sure        text,                   -- high | mid | low
    sort_key    int,                    -- 단원 순서*100 + 유형 순서 (작을수록 앞)
    assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_types_unit_code ON public.question_types (unit, code);

ALTER TABLE public.question_type_defs ENABLE ROW LEVEL SECURITY;   -- 정책 없음 = 서비스 롤만
ALTER TABLE public.question_types     ENABLE ROW LEVEL SECURITY;

-- 3) 검색 결과에서 쓰는 계산 칸 — PostgREST 는 questions 를 받는 함수를 '칸'처럼 select·order 할 수 있다.
--    question_bank_candidates / question_bank_all (SETOF questions) 결과에도 그대로 붙는다.
--    type_sort = sort_key*100 + 난이도(숫자) → 단원 → 유형 → 난이도 순. 유형 없는 문항은 NULL(맨 뒤).
CREATE OR REPLACE FUNCTION public.type_sort(public.questions)
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT t.sort_key::bigint*100 + coalesce(nullif(regexp_replace(coalesce($1.difficulty,''),'[^0-9]','','g'),'')::int,0)
 FROM public.question_types t WHERE t.question_id=$1.id;
$$;
CREATE OR REPLACE FUNCTION public.type_code(public.questions)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT t.code FROM public.question_types t WHERE t.question_id=$1.id;
$$;
REVOKE ALL ON FUNCTION public.type_sort(public.questions), public.type_code(public.questions) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.type_sort(public.questions), public.type_code(public.questions) TO service_role;

NOTIFY pgrst, 'reload schema';

-- 4) 교과외 유형(question_type_defs.offcur) 문항 판정 — questions.is_off_curriculum 을 고치지 않고 검색에서 거른다
CREATE OR REPLACE FUNCTION public.type_offcur(public.questions)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT d.offcur FROM public.question_types t JOIN public.question_type_defs d ON d.unit=t.unit AND d.code=t.code WHERE t.question_id=$1.id), false);
$$;
REVOKE ALL ON FUNCTION public.type_offcur(public.questions) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.type_offcur(public.questions) TO service_role;
NOTIFY pgrst, 'reload schema';

-- 5) 유형 순 검색 함수 (10/19 측정: 계산 칸 type_sort 는 문항마다 따로 찾아 '전체' 범위에서 8초 제한 초과 → 조인으로 한 번에)
--    '전체' 7.5만 문항 정렬 0.9초. 반환 칸 = 검색 라우트 SELECT 칸 + plain_text(키워드 조건용) + 유형 3칸.
CREATE OR REPLACE FUNCTION public.question_bank_typed(p_scope jsonb, p_excluded uuid[] DEFAULT '{}', p_all boolean DEFAULT false)
RETURNS TABLE(id uuid, question_number int, subject text, grade text, school text, year text, semester text, difficulty text,
              key_concepts text[], unit text, work_status text, source_db_id text, question_type text, is_off_curriculum boolean, plain_text text,
              type_sort bigint, type_code text, type_offcur boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_all THEN
  RETURN QUERY SELECT q.id,q.question_number,q.subject,q.grade,q.school,q.year,q.semester,q.difficulty,q.key_concepts,q.unit,q.work_status,q.source_db_id,q.question_type,q.is_off_curriculum,q.plain_text,
    t.sort_key::bigint*100 + coalesce(nullif(regexp_replace(coalesce(q.difficulty,''),'[^0-9]','','g'),'')::int,0), t.code, coalesce(d.offcur,false)
   FROM public.question_bank_all(p_excluded) q
   LEFT JOIN public.question_types t ON t.question_id=q.id LEFT JOIN public.question_type_defs d ON d.unit=t.unit AND d.code=t.code;
 ELSE
  RETURN QUERY SELECT q.id,q.question_number,q.subject,q.grade,q.school,q.year,q.semester,q.difficulty,q.key_concepts,q.unit,q.work_status,q.source_db_id,q.question_type,q.is_off_curriculum,q.plain_text,
    t.sort_key::bigint*100 + coalesce(nullif(regexp_replace(coalesce(q.difficulty,''),'[^0-9]','','g'),'')::int,0), t.code, coalesce(d.offcur,false)
   FROM public.question_bank_candidates(p_scope, p_excluded) q
   LEFT JOIN public.question_types t ON t.question_id=q.id LEFT JOIN public.question_type_defs d ON d.unit=t.unit AND d.code=t.code;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.question_bank_typed(jsonb,uuid[],boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_typed(jsonb,uuid[],boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
