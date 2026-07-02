-- 건의사항(suggestions) 비밀글 보안 잠금
-- 배경: RLS가 없어 anon 키로 비밀번호·본문 컬럼까지 직접 조회 가능했음.
-- 앱은 이제 전부 서버 API(service role) 경유로 전환됨 → 클라이언트 직접 접근을 차단한다.
-- 실행: Supabase 대시보드 → SQL Editor 에서 1회 실행. (service role은 RLS를 우회하므로 앱 동작에 영향 없음)

-- 1) 기존 정책 전부 제거 (이름 무관)
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'suggestions'
  loop
    execute format('drop policy %I on public.suggestions', pol.policyname);
  end loop;
end $$;

-- 2) RLS 활성화 — 정책이 하나도 없으므로 anon/authenticated 의 모든 직접 접근 거부
alter table public.suggestions enable row level security;

-- 3) 확인용: 아래가 0행이어야 정상 (정책 없음)
select policyname from pg_policies where schemaname = 'public' and tablename = 'suggestions';
