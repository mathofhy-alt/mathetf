-- 예상문제/학교프린트변형 시험지 생성 사용 로그
-- predict/hwp 라우트에서 시험지(.hml) 생성 성공 시 1건씩 기록 (service-role insert).
create table if not exists public.feature_usage (
    id             uuid primary key default gen_random_uuid(),
    user_id        uuid references auth.users(id) on delete set null,
    user_email     text,
    feature        text not null,            -- 'predict' | 'print'
    title          text,
    question_count int,
    created_at     timestamptz not null default now()
);

create index if not exists idx_feature_usage_created  on public.feature_usage (created_at desc);
create index if not exists idx_feature_usage_feature  on public.feature_usage (feature);

-- RLS on: 일반 클라이언트는 접근 불가. service-role(서버 라우트)만 insert/조회.
alter table public.feature_usage enable row level security;
