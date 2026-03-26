-- 관리자 인증 상태를 저장하기 위한 컬럼 추가
ALTER TABLE exam_materials 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
