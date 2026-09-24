-- One rewarded opinion per member and exam. The server calls this function with
-- the authenticated member's id; public API roles cannot execute it directly.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS opinion_points bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.exam_opinions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id uuid NOT NULL REFERENCES public.exam_materials(id),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    question_number integer NOT NULL CHECK (question_number > 0),
    reason text NOT NULL CHECK (reason IN ('발상·조건 해석', '계산량', '개념 융합', '시간 부족')),
    comment text NOT NULL CHECK (char_length(comment) BETWEEN 15 AND 400),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    hidden boolean NOT NULL DEFAULT false,
    CONSTRAINT exam_opinions_one_per_member UNIQUE (exam_id, user_id)
);

CREATE INDEX IF NOT EXISTS exam_opinions_exam_visible_idx
    ON public.exam_opinions (exam_id, created_at DESC) WHERE hidden = false;
CREATE INDEX IF NOT EXISTS exam_opinions_user_created_idx
    ON public.exam_opinions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.exam_opinion_rewards (
    opinion_id uuid PRIMARY KEY REFERENCES public.exam_opinions(id),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    amount integer NOT NULL DEFAULT 500 CHECK (amount = 500),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_opinion_rewards_user_idx ON public.exam_opinion_rewards (user_id, created_at DESC);

ALTER TABLE public.exam_opinions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_opinion_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exam_opinions FROM anon, authenticated;
REVOKE ALL ON public.exam_opinion_rewards FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_exam_opinion(
    p_exam_id uuid,
    p_user_id uuid,
    p_question_number integer,
    p_reason text,
    p_comment text,
    p_question_count integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_existing uuid;
    v_today integer;
    v_balance bigint;
    v_is_new boolean := false;
BEGIN
    IF p_user_id IS NULL OR p_exam_id IS NULL
       OR p_question_count IS NULL OR p_question_count < 1
       OR p_question_number NOT BETWEEN 1 AND p_question_count
       OR p_reason NOT IN ('발상·조건 해석', '계산량', '개념 융합', '시간 부족')
       OR char_length(trim(coalesce(p_comment, ''))) NOT BETWEEN 15 AND 400 THEN
        RAISE EXCEPTION '의견의 문항 번호와 내용을 확인해주세요.';
    END IF;

    -- A profile lock serializes simultaneous submissions from the same member.
    SELECT earned_points INTO v_balance FROM public.profiles
        WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '회원 정보를 찾을 수 없습니다.'; END IF;

    SELECT id INTO v_existing FROM public.exam_opinions
        WHERE exam_id = p_exam_id AND user_id = p_user_id;
    IF v_existing IS NULL THEN
        SELECT count(*) INTO v_today FROM public.exam_opinions
            WHERE user_id = p_user_id
              AND (created_at AT TIME ZONE 'Asia/Seoul')::date =
                  (now() AT TIME ZONE 'Asia/Seoul')::date;
        IF v_today >= 2 THEN
            RAISE EXCEPTION '오늘은 이미 두 시험지에 의견을 남겼습니다.';
        END IF;
        INSERT INTO public.exam_opinions (exam_id, user_id, question_number, reason, comment)
            VALUES (p_exam_id, p_user_id, p_question_number, p_reason, trim(p_comment))
            RETURNING id INTO v_existing;
        INSERT INTO public.exam_opinion_rewards (opinion_id, user_id) VALUES (v_existing, p_user_id);
        UPDATE public.profiles SET earned_points = coalesce(earned_points, 0) + 500,
                                   opinion_points = opinion_points + 500
            WHERE id = p_user_id;
        v_is_new := true;
    ELSE
        UPDATE public.exam_opinions
            SET question_number = p_question_number,
                reason = p_reason,
                comment = trim(p_comment),
                updated_at = now()
            WHERE id = v_existing;
    END IF;

    SELECT count(*) INTO v_today FROM public.exam_opinions
        WHERE user_id = p_user_id
          AND (created_at AT TIME ZONE 'Asia/Seoul')::date =
              (now() AT TIME ZONE 'Asia/Seoul')::date;
    RETURN jsonb_build_object('ok', true, 'rewarded', CASE WHEN v_is_new THEN 500 ELSE 0 END,
                              'todayCount', v_today);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_exam_opinion(uuid, uuid, integer, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_opinion(uuid, uuid, integer, text, text, integer) TO service_role;

-- Spending uses bonus points first. This trigger runs in the same transaction
-- as the existing purchase ledger entry, including the guarded order RPC.
CREATE OR REPLACE FUNCTION public.consume_opinion_points() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.type = 'purchase' AND NEW.amount < 0 THEN
        UPDATE public.profiles SET opinion_points = greatest(0, opinion_points + NEW.amount)
            WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS consume_opinion_points_on_purchase ON public.point_transactions;
CREATE TRIGGER consume_opinion_points_on_purchase
AFTER INSERT ON public.point_transactions FOR EACH ROW
EXECUTE FUNCTION public.consume_opinion_points();

-- The standard settlement balance includes sale proceeds and rewards. Only
-- the non-bonus portion may be withdrawn; opinion points remain purchase-only.
CREATE OR REPLACE FUNCTION public.request_settlement(
    p_user_id uuid, p_amount bigint, p_bank_name text,
    p_account_number text, p_account_holder text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_balance bigint;
    v_bonus bigint;
    v_request_id uuid;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('success', false, 'message', '본인 계정만 정산할 수 있습니다.');
    END IF;
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', '정산 금액을 확인해주세요.');
    END IF;
    SELECT coalesce(earned_points, 0), opinion_points INTO v_balance, v_bonus
        FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND OR v_balance - v_bonus < p_amount THEN
        RETURN jsonb_build_object('success', false, 'message', '출금 가능한 수익 포인트가 부족합니다.');
    END IF;
    UPDATE public.profiles SET earned_points = earned_points - p_amount WHERE id = p_user_id;
    INSERT INTO public.settlement_requests (user_id, amount, bank_name, account_number, account_holder)
        VALUES (p_user_id, p_amount, p_bank_name, p_account_number, p_account_holder)
        RETURNING id INTO v_request_id;
    INSERT INTO public.point_transactions (user_id, type, amount, description, related_id)
        VALUES (p_user_id, 'settlement_request', -p_amount, '정산 요청 (포인트 차감)', v_request_id);
    RETURN jsonb_build_object('success', true, 'request_id', v_request_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
