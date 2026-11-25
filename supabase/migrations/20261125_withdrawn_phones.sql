-- [2026-11-25] 회원 탈퇴 후 7일간 같은 휴대폰 번호로 재가입 금지(대표 지시).
-- 원번호는 남기지 않는다 — sha256('mathetf-withdraw:' || 숫자만) 값과 탈퇴 시각만. 7일 지난 행은 가입 확인 때 무시하고, 탈퇴 처리 때 지운다.
create table if not exists public.withdrawn_phones (
    phone_hash text primary key,
    withdrawn_at timestamptz not null default now()
);
alter table public.withdrawn_phones enable row level security;
-- 정책 없음 = anon/authenticated 접근 불가, 서비스 키만 사용.
