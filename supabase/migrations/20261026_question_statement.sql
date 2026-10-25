-- [10/26 대표] 시험지 만들기 키워드 검색을 '발문'에서만 — 지금은 plain_text(해설 포함)라서
--   「모든·실수·접선」 검색에 발문엔 '모든'이 없고 해설에만 있는 문항이 섞였다(송림고 2026 2중간 미적분I 23번).
-- 발문 텍스트는 별도 표에 둔다: questions 대량 UPDATE 는 HNSW 때문에 MICRO 에서 시간 초과(10/13 배점 표와 같은 이유).
-- 아직 발문이 없는 문항은 예전처럼 plain_text 로 찾는다(새로 등록된 문항이 검색에서 빠지지 않게).

CREATE TABLE IF NOT EXISTS public.question_statement (
  question_id uuid PRIMARY KEY REFERENCES public.questions(id) ON DELETE CASCADE,
  text        text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.question_statement ENABLE ROW LEVEL SECURITY;   -- 정책 없음 = 서비스 롤만

-- 1) SETOF questions 를 돌려주는 검색 함수(question_bank_all·candidates)용 계산 칸
CREATE OR REPLACE FUNCTION public.stmt_text(public.questions)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT s.text FROM public.question_statement s WHERE s.question_id=$1.id), $1.plain_text);
$$;
REVOKE ALL ON FUNCTION public.stmt_text(public.questions) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stmt_text(public.questions) TO service_role;

-- 2) 유형 순 검색 함수 — 반환 칸에 stmt_text 를 더한다(plain_text 는 배포 전 코드용으로 남김)
DROP FUNCTION IF EXISTS public.question_bank_typed(jsonb, uuid[], boolean);
CREATE FUNCTION public.question_bank_typed(p_scope jsonb, p_excluded uuid[] DEFAULT '{}', p_all boolean DEFAULT false)
RETURNS TABLE(id uuid, question_number int, subject text, grade text, school text, year text, semester text, difficulty text,
              key_concepts text[], unit text, work_status text, source_db_id text, question_type text, is_off_curriculum boolean, plain_text text,
              type_sort bigint, type_code text, type_offcur boolean, stmt_text text)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_all THEN
  RETURN QUERY SELECT q.id,q.question_number,q.subject,q.grade,q.school,q.year,q.semester,q.difficulty,q.key_concepts,q.unit,q.work_status,q.source_db_id,q.question_type,q.is_off_curriculum,q.plain_text,
    t.sort_key::bigint*100 + coalesce(nullif(regexp_replace(coalesce(q.difficulty,''),'[^0-9]','','g'),'')::int,0), t.code, coalesce(d.offcur,false),
    coalesce(s.text, q.plain_text)
   FROM public.question_bank_all(p_excluded) q
   LEFT JOIN public.question_types t ON t.question_id=q.id LEFT JOIN public.question_type_defs d ON d.unit=t.unit AND d.code=t.code
   LEFT JOIN public.question_statement s ON s.question_id=q.id;
 ELSE
  RETURN QUERY SELECT q.id,q.question_number,q.subject,q.grade,q.school,q.year,q.semester,q.difficulty,q.key_concepts,q.unit,q.work_status,q.source_db_id,q.question_type,q.is_off_curriculum,q.plain_text,
    t.sort_key::bigint*100 + coalesce(nullif(regexp_replace(coalesce(q.difficulty,''),'[^0-9]','','g'),'')::int,0), t.code, coalesce(d.offcur,false),
    coalesce(s.text, q.plain_text)
   FROM public.question_bank_candidates(p_scope, p_excluded) q
   LEFT JOIN public.question_types t ON t.question_id=q.id LEFT JOIN public.question_type_defs d ON d.unit=t.unit AND d.code=t.code
   LEFT JOIN public.question_statement s ON s.question_id=q.id;
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.question_bank_typed(jsonb,uuid[],boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_typed(jsonb,uuid[],boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
