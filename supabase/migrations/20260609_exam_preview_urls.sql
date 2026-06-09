-- 시험지별 상세 페이지의 "문제 앞 1~2페이지 미리보기" 이미지 URL 저장용 컬럼.
-- 공개 버킷(exam-previews)에 올린 워터마크 미리보기 이미지의 public URL 배열을 담는다.
ALTER TABLE exam_materials
    ADD COLUMN IF NOT EXISTS preview_urls jsonb;

COMMENT ON COLUMN exam_materials.preview_urls IS '문제 미리보기 이미지 public URL 배열 (jsonb). 해설 PDF 행에만 채움.';
