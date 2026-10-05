-- 원본 제보 채택 보상(2026-10-05)
-- point_transactions.type 체크 제약에 'submission_reward' 가 없어 채택 지급 내역이 늘 실패했다.
-- 기존 6종은 그대로 두고 한 종류만 더한다. 같은 제보에 보상 내역이 두 번 생기지 않게 유니크 인덱스도 둔다.
ALTER TABLE public.point_transactions DROP CONSTRAINT IF EXISTS point_transactions_type_check;
ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_type_check
    CHECK (type IN ('charge', 'purchase', 'sale', 'settlement_request', 'settlement_refund', 'settlement_completed', 'submission_reward'));
CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_submission_reward_once
    ON public.point_transactions (related_id) WHERE type = 'submission_reward';
