-- 최적화: 정렬 및 상태 필터링 성능 향상을 위한 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_questions_sorting ON questions (year DESC, semester, school, question_number);
CREATE INDEX IF NOT EXISTS idx_questions_work_status ON questions (work_status);
