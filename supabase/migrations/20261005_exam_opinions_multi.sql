-- 시험지 의견을 여러 개 (2026-10-05 사용자 요청)
-- 전: 회원 1명 × 시험지 1개 = 의견 1개. 두 번째로 쓰면 첫 의견을 덮어썼다.
-- 후: 문항마다 의견 1개(같은 문항에 다시 쓰면 그 의견만 수정), 한 시험지에 여러 문항.
--     500P 는 시험지당 첫 의견 1회, 하루 2개 시험지까지(그 이상은 의견만 저장). 이전엔 하루 2개를 넘으면 작성 자체가 막혔다.
ALTER TABLE public.exam_opinions DROP CONSTRAINT IF EXISTS exam_opinions_one_per_member;
ALTER TABLE public.exam_opinions ADD CONSTRAINT exam_opinions_one_per_question UNIQUE (exam_id, user_id, question_number);

-- 지급 기록을 '시험지' 단위로 — 의견이 여러 개여도 같은 시험지로 두 번 지급하지 않게
ALTER TABLE public.exam_opinion_rewards ADD COLUMN IF NOT EXISTS exam_id uuid REFERENCES public.exam_materials(id);
UPDATE public.exam_opinion_rewards r SET exam_id = o.exam_id
    FROM public.exam_opinions o WHERE o.id = r.opinion_id AND r.exam_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exam_opinion_rewards_once_per_exam ON public.exam_opinion_rewards (user_id, exam_id);

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
    v_new uuid;
    v_today integer;
    v_rewarded integer := 0;
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
    PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '회원 정보를 찾을 수 없습니다.'; END IF;

    SELECT id INTO v_existing FROM public.exam_opinions
        WHERE exam_id = p_exam_id AND user_id = p_user_id AND question_number = p_question_number;
    IF v_existing IS NOT NULL THEN
        UPDATE public.exam_opinions
            SET reason = p_reason, comment = trim(p_comment), updated_at = now()
            WHERE id = v_existing;
    ELSE
        INSERT INTO public.exam_opinions (exam_id, user_id, question_number, reason, comment)
            VALUES (p_exam_id, p_user_id, p_question_number, p_reason, trim(p_comment))
            RETURNING id INTO v_new;
        v_is_new := true;
        IF NOT EXISTS (SELECT 1 FROM public.exam_opinion_rewards WHERE user_id = p_user_id AND exam_id = p_exam_id) THEN
            SELECT count(*) INTO v_today FROM public.exam_opinion_rewards
                WHERE user_id = p_user_id
                  AND (created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date;
            IF v_today < 2 THEN
                INSERT INTO public.exam_opinion_rewards (opinion_id, user_id, exam_id) VALUES (v_new, p_user_id, p_exam_id);
                UPDATE public.profiles SET earned_points = coalesce(earned_points, 0) + 500,
                                           opinion_points = opinion_points + 500
                    WHERE id = p_user_id;
                v_rewarded := 500;
            END IF;
        END IF;
    END IF;

    SELECT count(*) INTO v_today FROM public.exam_opinion_rewards
        WHERE user_id = p_user_id
          AND (created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date;
    RETURN jsonb_build_object('ok', true, 'rewarded', v_rewarded, 'isNew', v_is_new, 'todayCount', v_today,
        'examRewarded', EXISTS (SELECT 1 FROM public.exam_opinion_rewards WHERE user_id = p_user_id AND exam_id = p_exam_id));
END;
$$;

REVOKE ALL ON FUNCTION public.submit_exam_opinion(uuid, uuid, integer, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_exam_opinion(uuid, uuid, integer, text, text, integer) TO service_role;
