-- 회원가입 시 무료로 받을 수 있는 "문제만 PDF"의 public URL 저장용 컬럼.
-- 공개 버킷(exam-free-problems)에 올린, 원본에서 문제 페이지만 추출한 깨끗한 PDF의 public URL.
-- 해설 PDF 행(file_type='PDF', content_type='해설')에만 채운다. 미리보기와 동일한 문제/해설 경계 사용.
ALTER TABLE exam_materials
    ADD COLUMN IF NOT EXISTS free_pdf_url text;

COMMENT ON COLUMN exam_materials.free_pdf_url IS '무료 문제만 PDF public URL. 해설 PDF 행에만 채움. 회원가입 후 다운로드 제공.';
