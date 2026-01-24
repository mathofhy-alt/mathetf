-- [CRITICAL] question_images 테이블 보수 (V21)
-- 수식 이미지(SVG/파일기반) 저장을 지원하기 위한 컬럼 추가 및 제약 조건 변경

-- 1. storage_path 컬럼 추가 (생략 가능하도록)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='question_images' AND COLUMN_NAME='storage_path') THEN
        ALTER TABLE question_images ADD COLUMN storage_path TEXT;
    END IF;
END $$;

-- 2. data 컬럼 NULL 허용 (SVG 파일 저장 시 data 생략 가능하도록)
ALTER TABLE question_images ALTER COLUMN data DROP NOT NULL;

COMMENT ON COLUMN question_images.storage_path IS '서버 정적 파일 경로 또는 스토리지 경로 (수식 SVG 등)';
