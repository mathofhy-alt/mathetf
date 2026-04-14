-- =========================================================================
-- 안티그래비티 수학ETF 데이터베이스 성능 최적화 인덱스 (Supabase)
-- =========================================================================

-- 1. questions 테이블 주요 검색 필드 인덱스
-- 관리자 화면 및 사용자 검색 시 가장 많이 필터링되는 조건들입니다.
CREATE INDEX IF NOT EXISTS idx_questions_work_status ON public.questions(work_status);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON public.questions(subject);
CREATE INDEX IF NOT EXISTS idx_questions_grade ON public.questions(grade);
CREATE INDEX IF NOT EXISTS idx_questions_year ON public.questions(year);
CREATE INDEX IF NOT EXISTS idx_questions_school ON public.questions(school);

-- 2. question_images 테이블 외래키(Foreign Key) 인덱스
-- 질문과 이미지를 매칭(JOIN)할 때 스캔 속도를 획기적으로 높여줍니다.
CREATE INDEX IF NOT EXISTS idx_question_images_question_id ON public.question_images(question_id);

-- 3. question_images 로컬 캡처 동기화 시 검색 속도 향상
-- 파이썬 로컬 캡처 툴에서 이미지 유무를 검사할 때 속도를 획기적으로 높여줍니다.
CREATE INDEX IF NOT EXISTS idx_question_images_original_bin_id ON public.question_images(original_bin_id);
