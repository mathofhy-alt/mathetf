-- [2026-11-25] 회원 탈퇴 후 7일간 같은 휴대폰 번호로 재가입 금지(대표 지시).
-- 원번호는 남기지 않는다 — sha256('mathetf-withdraw:' || 숫자만) 값과 탈퇴 시각만. 7일 지난 행은 가입 확인 때 무시하고, 탈퇴 처리 때 지운다.
create table if not exists public.withdrawn_phones (
    phone_hash text primary key,
    withdrawn_at timestamptz not null default now()
);
alter table public.withdrawn_phones enable row level security;
-- 정책 없음 = anon/authenticated 접근 불가, 서비스 키만 사용.

-- [11/25 배포 전 검토] 웹 공개 역할의 표 권한 회수(RLS 정책 0개에만 기대지 않게)
revoke all on public.withdrawn_phones from anon, authenticated;
-- 매일 정리: 7일 지난 탈퇴 번호 기록, 하루 지난 휴대폰 인증 기록(원번호가 남지 않게)
select cron.schedule('withdrawn-phones-cleanup', '23 18 * * *',
  $$delete from public.withdrawn_phones where withdrawn_at < now() - interval '7 days';
    delete from public.phone_verifications where expires_at < now() - interval '1 day';$$);
