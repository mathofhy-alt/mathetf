-- 문항 단원 옮기기 기록 (2026-10-20 대표: "내가 보이는 건 수동으로 이동을 시켜야 할 것 같은데")
-- 시험지출제 카드의 운영자 전용 「단원 옮기기」가 남긴다.
--   같은 과목 안: 바로 옮기고 status='done' (예전 단원의 대표 유형은 지움 → scripts/types/apply_unit_moves.py 가 새 단원 유형을 붙인다)
--   다른 과목으로: status='pending' 만 남김 → 같은 스크립트가 회차 개인DB 의 source_db_id 를 먼저 확인·채운 뒤 과목·단원을 바꾼다
--     (9/16 사고: 과목만 바꿔 120문항이 자기 회차 개인DB 에서 빠졌다)
CREATE TABLE IF NOT EXISTS public.question_unit_moves (
    id           bigserial PRIMARY KEY,
    question_id  uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    from_subject text,
    from_unit    text,
    to_subject   text NOT NULL,
    to_unit      text NOT NULL,
    status       text NOT NULL DEFAULT 'pending',   -- pending | done | typed | failed
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    done_at      timestamptz
);
CREATE INDEX IF NOT EXISTS question_unit_moves_status ON public.question_unit_moves (status);
ALTER TABLE public.question_unit_moves ENABLE ROW LEVEL SECURITY;   -- 정책 없음 = 서비스 롤만
