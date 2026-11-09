-- 기존 글은 NULL = 문자 알림 안 함. 기존 RLS/GRANT를 변경하지 않는다.
-- 선행 보안 설정: migration_suggestions_rls.sql (직접 접근 차단).
BEGIN;
-- 레거시 공개 SELECT 정책이 남은 DB에서는 새 설정도 공개될 수 있다.
-- 권한/정책을 자동 변경하지 않고, 기존 비밀글 잠금이 적용된 DB에서만 진행한다.
DO $$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.suggestions'::regclass)
       OR EXISTS (
           SELECT 1 FROM pg_policy
           WHERE polrelid = 'public.suggestions'::regclass AND polcmd IN ('r', '*')
             AND polroles && ARRAY[0::oid, 'anon'::regrole::oid, 'authenticated'::regrole::oid]
       ) THEN
        RAISE EXCEPTION 'suggestions privacy lockdown required: review migration_suggestions_rls.sql before adding notification columns';
    END IF;
END $$;
ALTER TABLE public.suggestions
    ADD COLUMN IF NOT EXISTS notify jsonb NULL,
    ADD COLUMN IF NOT EXISTS reply_notified_at timestamptz NULL;

COMMENT ON COLUMN public.suggestions.notify IS
    '답변 문자 선택 {sms:boolean, when:asap|morning|afternoon|evening|night}. NULL은 미신청. 서버 API 전용.';
COMMENT ON COLUMN public.suggestions.reply_notified_at IS
    '답변 문자 원자적 선점 시각. failed는 NULL로 복구, no_phone은 유지.';
COMMIT;
