-- 개인DB → 문항 묶음 직접 연결 (2026-08-20)
--
-- 배경: 검색은 exam_materials 의 school+grade+exam_year+semester+exam_type+subject 로
--       questions 를 매칭한다. 2014 고2 3월처럼 A형·B형이 같은 회차에 있으면 이 키가
--       완전히 같아, 개인DB 를 둘로 나눠도 양쪽 모두 60문항이 나온다.
--
-- 방침: 개인DB 행이 가리키는 questions.source_db_id 를 직접 저장한다.
--       값이 있으면 그것으로 매칭하고, 없으면(기존 행 전부) 종전 로직을 그대로 쓴다.
--       A/B형·가/나형처럼 같은 회차에 여러 시험지가 있는 경우에만 채우면 된다.
ALTER TABLE public.exam_materials
    ADD COLUMN IF NOT EXISTS source_db_id TEXT;

COMMENT ON COLUMN public.exam_materials.source_db_id IS
    '이 개인DB가 가리키는 questions.source_db_id. 채워져 있으면 검색이 이 값으로 직접 매칭(A/B형 구분용). NULL 이면 기존 메타데이터 매칭.';

CREATE INDEX IF NOT EXISTS idx_questions_source_db_id ON public.questions (source_db_id);

NOTIFY pgrst, 'reload schema';
