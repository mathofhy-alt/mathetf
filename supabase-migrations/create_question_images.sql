-- HML V2: question_images 테이블 생성
-- 문항별 이미지 바이너리 데이터 저장용

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS question_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  original_bin_id TEXT NOT NULL,      -- e.g., "BIN0001"
  format TEXT DEFAULT 'jpg',           -- jpg, png, gif
  data TEXT NOT NULL,                  -- Pure Base64 encoded image data
  size_bytes INT NOT NULL,             -- Original binary size (NOT Base64 length)
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 인덱스 생성 (질문별 이미지 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_question_images_question 
  ON question_images(question_id);

-- 3. RLS 정책 (필요시)
-- ALTER TABLE question_images ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow all for authenticated" ON question_images
--   FOR ALL USING (auth.role() = 'authenticated');

COMMENT ON TABLE question_images IS 'HML 문항에서 추출된 이미지 바이너리 데이터 저장';
COMMENT ON COLUMN question_images.original_bin_id IS '원본 HML에서의 BIN ID (BIN0001 형식)';
COMMENT ON COLUMN question_images.data IS 'Base64 인코딩된 이미지 데이터';
COMMENT ON COLUMN question_images.size_bytes IS '원본 바이너리 사이즈 (Base64 길이 아님)';
