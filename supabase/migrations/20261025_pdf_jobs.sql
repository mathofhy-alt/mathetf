-- 한글 → PDF 변환 작업 목록 (2026-10-25 대표 "이걸로 pdf 받기를 만들지")
-- 사이트(버셀)는 한글을 못 돌린다. 아이윈브 윈도우 서버(seoul-exam-server, 한글 2022)가 이 표를 1~2초마다 보고
-- pending 을 하나 가져가(working) 저장소 pdf-jobs/<id>.hml → <id>.pdf 로 바꿔 올린 뒤 done 으로 적는다.
-- 서버는 문을 열지 않는다(밖으로만 나간다). 읽기·쓰기는 서버 권한(service_role)만 — 회원은 사이트 API 를 거친다.
create table if not exists public.pdf_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,                       -- predict(예상문제) · print(프린트변형) · exam(시험지 만들기)
  title text,
  status text not null default 'pending' check (status in ('pending', 'working', 'done', 'error')),
  error text,
  pages int,
  sec numeric,
  worker text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  done_at timestamptz
);
create index if not exists pdf_jobs_pending on public.pdf_jobs (created_at) where status = 'pending';
create index if not exists pdf_jobs_user on public.pdf_jobs (user_id, created_at desc);
alter table public.pdf_jobs enable row level security;   -- 정책 없음 = service_role 만
revoke all on public.pdf_jobs from anon, authenticated;
