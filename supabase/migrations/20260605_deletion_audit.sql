-- 시험지/DB/폴더 삭제 감사 로그
-- 목적: "시험지가 언제, 무엇 때문에 사라졌는지" 추적. (삭제 흔적이 없어 원인 파악이 안 되던 문제 해결)
-- 1회만 Supabase SQL Editor에서 실행하면 됨.

CREATE TABLE IF NOT EXISTS deletion_audit (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    item_type     TEXT,        -- 'saved_exam' | 'personal_db' | 'folder'
    item_id       UUID,        -- 삭제된 user_items.id 또는 folders.id
    item_name     TEXT,        -- 이름(있으면)
    reference_id  UUID,        -- saved_exam의 파일 id 등
    reason        TEXT,        -- 'user_delete_item' | 'folder_delete_cascade' | 'user_delete_folder'
    context       JSONB,       -- 부가정보(폴더 id, 개수 등)
    deleted_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_user ON deletion_audit(user_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_ref  ON deletion_audit(reference_id);

ALTER TABLE deletion_audit ENABLE ROW LEVEL SECURITY;

-- 본인 로그만 조회 가능
DROP POLICY IF EXISTS "users read own deletion audit" ON deletion_audit;
CREATE POLICY "users read own deletion audit"
    ON deletion_audit FOR SELECT
    USING (auth.uid() = user_id);

-- 본인 user_id 로만 기록 삽입 가능 (서버 라우트가 쿠키 클라이언트로 insert)
DROP POLICY IF EXISTS "users insert own deletion audit" ON deletion_audit;
CREATE POLICY "users insert own deletion audit"
    ON deletion_audit FOR INSERT
    WITH CHECK (auth.uid() = user_id);
