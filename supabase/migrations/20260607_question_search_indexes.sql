-- ================================================================
-- 문제 검색 속도 개선용 인덱스
-- 생성일: 2026-06-07
--
-- 배경: 검색은 work_status='sorted' 로 거르고 question_number 로 정렬하는데,
--       두 컬럼에 인덱스가 없어(기존엔 is_sorted 인덱스만 존재) 풀스캔이 발생.
--
-- 조치: sorted 부분 인덱스 + 자주 쓰는 필터 조합 인덱스 추가.
--       읽기 전용 추가라 데이터/동작 변경 없음. 안전.
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 실행 (1회).
-- ================================================================

-- 1) sorted 문제만 + 정렬(question_number)까지 커버하는 부분 인덱스
--    → "WHERE work_status='sorted' ORDER BY question_number" 가 인덱스를 탐
CREATE INDEX IF NOT EXISTS idx_q_sorted_qnum
  ON public.questions (question_number)
  WHERE work_status = 'sorted';

-- 2) 자주 쓰는 필터 조합 (검색 OR 조건의 핵심 컬럼들)
CREATE INDEX IF NOT EXISTS idx_q_filter
  ON public.questions (work_status, school, grade, year, semester, subject);

-- 3) 단원/난이도 단독 필터 보강
CREATE INDEX IF NOT EXISTS idx_q_unit
  ON public.questions (unit) WHERE work_status = 'sorted';

-- (참고) 적용 후 검색이 인덱스를 타는지 확인:
-- EXPLAIN ANALYZE
-- SELECT id FROM questions WHERE work_status='sorted' ORDER BY question_number LIMIT 50;
