-- 관리자 문항 관리 정렬 최적화 (year DESC, semester ASC, school ASC, question_number ASC)
CREATE INDEX IF NOT EXISTS idx_questions_admin_sort 
ON questions (year DESC, semester ASC, school ASC, question_number ASC);

-- 필터링 최적화 (work_status, subject, grade)
CREATE INDEX IF NOT EXISTS idx_questions_filter 
ON questions (work_status, subject, grade);

-- 이미지 조회 최적화
CREATE INDEX IF NOT EXISTS idx_question_images_question_id 
ON question_images (question_id);
