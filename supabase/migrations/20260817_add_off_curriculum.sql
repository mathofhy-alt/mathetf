-- 교과외 문항 표시 (2026-08-17)
--
-- 배경: 2006년 등 옛 회차를 등록하면서, 현행 2022 개정 교육과정에서 삭제된 내용
--       (부등식의 영역·이중근호·이항연산 등)이 AI 태깅 과정에서 "가장 비슷해 보이는
--       현행 단원"으로 억지 매핑되는 문제가 확인됨(2006 고2 3월 30문항 중 4문항).
--       AI에게 '해당 없음' 선택지를 주지 않은 게 원인.
--
-- 방침: 문항을 버리지 않고 ①정확한 구 단원명을 붙이고 ②교과외 딱지를 달아
--       사용자가 볼지 말지 직접 선택하게 한다(기본값은 숨김).
ALTER TABLE public.questions
    ADD COLUMN IF NOT EXISTS is_off_curriculum BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.questions.is_off_curriculum IS
    '현행 교육과정에서 삭제된 내용(교과외). 검색·시험지출제에서 기본 제외, 사용자가 옵션을 켜면 포함.';

-- 검색은 항상 work_status='sorted' + 교과외 제외로 들어오므로 부분 인덱스가 유효
CREATE INDEX IF NOT EXISTS idx_questions_sorted_in_curriculum
    ON public.questions (school, year)
    WHERE work_status = 'sorted' AND is_off_curriculum = FALSE;

NOTIFY pgrst, 'reload schema';
