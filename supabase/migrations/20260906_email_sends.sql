-- [시즌 이메일] 발송 이력 — 중복 발송을 막는 유일한 장치다.
--
-- 왜 필요한가:
--   Resend 무료 한도가 하루 100통이라 196명에게 한 번에 못 보낸다. 이틀에 나눠 보내는데,
--   이 표가 없으면 둘째 날에 첫날 받은 사람이 또 받는다.
--   광고성 메일을 이틀 연속 받으면 스팸 신고로 이어지고 도메인 평판이 깎인다.
--
-- ⚠ Supabase SQL 편집기에서 직접 실행해야 한다(이 저장소엔 SQL 실행 경로가 없다).

CREATE TABLE IF NOT EXISTS email_sends (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign     text        NOT NULL,           -- 예: '2026-09-season'
    user_id      uuid        NOT NULL,
    email        text        NOT NULL,
    -- 'sent' | 'failed' | 'skipped'
    status       text        NOT NULL DEFAULT 'sent',
    provider_id  text,                            -- Resend 메시지 id (문제 추적용)
    error        text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- 같은 캠페인에서 한 사람에게 두 번 보내지 않는다. 이 제약이 중복 방지의 핵심이다.
-- ⚠ 실패(failed)는 다시 시도해야 하므로 성공분에만 건다.
CREATE UNIQUE INDEX IF NOT EXISTS email_sends_campaign_user_uniq
    ON email_sends (campaign, user_id)
    WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS email_sends_campaign_idx ON email_sends (campaign, created_at DESC);

COMMENT ON TABLE email_sends IS
    '시즌 이메일 발송 이력. (campaign, user_id) 중복 발송 방지 + 열람/클릭 대신 발송 사실만 남긴다.';

-- 서비스 롤로만 쓴다. 일반 사용자에게 노출할 이유가 없다.
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
