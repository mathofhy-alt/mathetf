-- Final plans migration: neither superseded 20261108 migration was deployed.
-- Both trigger replacements and the final RPC definitions are atomic; retry CORE on failure.
-- REQUEST CORE
-- Send this entire BEGIN/COMMIT block as ONE Management API request.
begin;
set local lock_timeout = '3s';
alter table public.feature_usage add column if not exists set_hash text;
alter table public.pdf_jobs add column if not exists question_ids uuid[];
alter table public.pdf_jobs add column if not exists set_hash text;
alter table public.pdf_jobs add column if not exists plan_charge text;
alter table public.pdf_jobs add column if not exists retain_until timestamptz;
alter table public.pdf_jobs add column if not exists hwp_ready boolean not null default false;
alter table public.pdf_jobs add column if not exists pdf_delivered boolean not null default false;
-- NULL은 영수증 배포 전에 생성된 작업에만 남는다. 새 묶음은 RPC에서 영수증을 필수 검사한다.
alter table public.pdf_jobs add column if not exists receipt_id uuid;

create table if not exists public.bundle_selections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  kind text not null check(kind in ('print','predict')), question_ids uuid[] not null,
  created_at timestamptz not null default now()
);
alter table public.bundle_selections enable row level security;
revoke all on public.bundle_selections from public,anon,authenticated;
grant all on public.bundle_selections to service_role;

-- 보관함 항목은 차감 증거가 아니다. 회원은 이 테이블을 읽거나 쓸 수 없다.
create table if not exists public.exam_save_proofs (
  item_id uuid primary key, user_id uuid not null, reference_id uuid not null, hml_path text
);
-- NULL은 새 저장 RPC의 증거. legacy는 허용 당시 cutoff를 영구 보존한다.
alter table public.exam_save_proofs add column if not exists legacy_cutoff timestamptz;
alter table public.exam_save_proofs enable row level security;
revoke all on public.exam_save_proofs from public,anon,authenticated;
grant all on public.exam_save_proofs to service_role;
create table if not exists public.plan_deployments (
  name text primary key, deployed_at timestamptz not null default now()
);
alter table public.plan_deployments enable row level security;
revoke all on public.plan_deployments from public,anon,authenticated;
grant all on public.plan_deployments to service_role;
-- 반복 백필이 회원의 과거 날짜 위조까지 승인하지 않도록 배포 시 스냅샷과 서버 저장만 후보로 남긴다.
create table if not exists public.exam_save_backfill_candidates (
  item_id uuid primary key, user_id uuid not null, reference_id uuid not null,
  hml_path text, created_at timestamptz not null
);
alter table public.exam_save_backfill_candidates enable row level security;
revoke all on public.exam_save_backfill_candidates from public,anon,authenticated;
grant all on public.exam_save_backfill_candidates to service_role;
-- SECURITY INVOKER: save_exam_item의 서버 권한 문맥만 기록한다. 회원의 직접 INSERT는 후보가 아니다.
create or replace function public.capture_exam_save_candidate() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user not in ('anon','authenticated') and new.type='saved_exam' and new.reference_id is not null then
    insert into public.exam_save_backfill_candidates(item_id,user_id,reference_id,hml_path,created_at)
      values(new.id,new.user_id,new.reference_id,new.details->>'hml_path',now()) on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.capture_exam_save_candidate() from public,anon,authenticated;
drop trigger if exists capture_exam_save_candidate on public.user_items;
create trigger capture_exam_save_candidate after insert on public.user_items
  for each row execute function public.capture_exam_save_candidate();
-- 먼저 트리거를 설치해 스냅샷 수집 중 완료되는 옛 저장도 빠뜨리지 않는다.
do $$
begin
  insert into public.plan_deployments(name) values ('exam_save_backfill_candidates') on conflict do nothing;
  if found then
    insert into public.exam_save_backfill_candidates(item_id,user_id,reference_id,hml_path,created_at)
      select id,user_id,reference_id,details->>'hml_path',created_at from public.user_items
      where type='saved_exam' and reference_id is not null on conflict (item_id) do nothing;
  end if;
end;
$$;

-- 배포 직후 옛 코드의 마지막 저장까지 다시 백필한다. 기존 증거/파일 허용 시각은 덮어쓰지 않는다.
create or replace function public.backfill_exam_save_proofs(p_cutoff timestamptz default null)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare cutoff timestamptz; added bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('exam_save_proofs',81108));
  select coalesce(p_cutoff,
    (select deployed_at from public.plan_deployments where name='exam_save_proofs_cutoff'),
    (select deployed_at from public.plan_deployments where name='exam_save_proofs')) into cutoff;
  if cutoff is null or cutoff > now() then raise exception 'INVALID_CUTOFF'; end if;
  if p_cutoff is not null then
    insert into public.plan_deployments(name,deployed_at) values ('exam_save_proofs_cutoff',cutoff)
      on conflict (name) do update set deployed_at=excluded.deployed_at;
  end if;
  insert into public.exam_save_proofs(item_id,user_id,reference_id,hml_path,legacy_cutoff)
    select i.id,i.user_id,i.reference_id,i.details->>'hml_path',cutoff
    from public.user_items i join public.exam_save_backfill_candidates c
      on c.item_id=i.id and c.user_id=i.user_id and c.reference_id=i.reference_id
        and c.hml_path is not distinct from i.details->>'hml_path'
    where i.type='saved_exam' and i.created_at<cutoff and c.created_at<cutoff
    on conflict (item_id) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;
revoke all on function public.backfill_exam_save_proofs(timestamptz) from public,anon,authenticated;
grant execute on function public.backfill_exam_save_proofs(timestamptz) to service_role;

-- 7차 증거도 업그레이드한다. 새 RPC의 locked 원본 증거는 최초 적용 이후라 영향받지 않는다.
update public.exam_save_proofs p set legacy_cutoff=d.deployed_at
from public.plan_deployments d
where d.name='exam_save_proofs' and p.legacy_cutoff is null
  and (p.hml_path is null or p.hml_path not like 'locked/%'
    or exists (select 1 from public.user_items i where i.id=p.item_id and i.created_at<d.deployed_at));

-- 자동 백필은 최초 적용 때만. 재적용만으로 소급 등록하지 않고 명시적 서버 호출로 마무리한다.
do $$
begin
  insert into public.plan_deployments(name) values ('exam_save_proofs')
    on conflict do nothing;
  if found then
    perform public.backfill_exam_save_proofs();
  end if;
end;
$$;

-- 회원이 바꿀 수 있는 옛 경로는 삭제·재업로드까지 포함해 cutoff 이후 변경을 허용하지 않는다.
create or replace function public.legacy_exam_file_unchanged(p_item uuid,p_user uuid,p_reference uuid,p_path text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return exists (
    select 1 from public.exam_save_proofs p join storage.objects o
      on o.bucket_id='exams' and o.name=coalesce(p.hml_path,p.user_id::text || '/' || p.reference_id::text || '.hml')
    where p.item_id=p_item and p.user_id=p_user and p.reference_id=p_reference
      and p.hml_path is not distinct from p_path and p.legacy_cutoff is not null
      and o.created_at<=p.legacy_cutoff and o.updated_at<=p.legacy_cutoff
  );
end;
$$;
revoke all on function public.legacy_exam_file_unchanged(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.legacy_exam_file_unchanged(uuid,uuid,uuid,text) to service_role;

-- 과거 bundle은 전부 프린트 몫. 이미 지워진 파일/미보관 문항 ID는 복원할 수 없다.
update public.pdf_jobs j set
  set_hash = u.set_hash,
  plan_charge = split_part(u.feature, '_', 2),
  retain_until = case when j.kind = 'print' and u.feature in ('plan_exam_bundle','plan_once_bundle')
                      then j.created_at + interval '30 days' else null end
from public.feature_usage u
where u.user_id = j.user_id and u.title = j.id::text
  and u.feature in ('plan_free_bundle','plan_exam_bundle','plan_once_bundle')
  and j.plan_charge is null;

-- 서비스 역할만 호출. 문항 판매 권한·강사 우회는 서버가 검사하고 프린트 차감은 잠금 안에서 다시 계산한다.
-- 같은 회원의 PDF·한글 요청을 직렬화하고, 같은 묶음 재사용 및 사용 기록을 원자적으로 확정한다.
drop function if exists public.create_plan_bundle(uuid,uuid,text,text,text,uuid[],text,text,boolean,text[],int,timestamptz);
create or replace function public.create_plan_bundle(
  p_id uuid, p_user uuid, p_email text, p_kind text, p_title text, p_ids uuid[], p_hash text,
  p_charge text, p_hwp boolean, p_features text[], p_limit int, p_since timestamptz, p_receipt uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j public.pdf_jobs;
  used int;
  feature_name text;
  day_start timestamptz;
  week_start timestamptz;
  exam_purchase record;
  exam_start timestamptz;
  exam_until timestamptz;
  exam_granted int := 0;
  once_total int;
begin
  if not exists (select 1 from public.bundle_selections r where r.id=p_receipt and r.user_id=p_user
    and r.kind=p_kind and p_ids <@ r.question_ids) then
    raise exception 'INVALID_RECEIPT';
  end if;
  if p_kind not in ('print','predict') or p_charge not in ('free','exam','once','teacher')
     or (p_kind = 'predict' and (p_charge = 'once' or (p_hwp and p_charge <> 'teacher'))) or (p_hwp and p_charge = 'free')
     or coalesce(cardinality(p_ids), 0) not between 1 and 50 then
    raise exception 'INVALID_BUNDLE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 81108));
  select * into j from public.pdf_jobs
  where user_id = p_user and kind = p_kind and set_hash = p_hash
    and (status <> 'error' or hwp_ready or pdf_delivered)
    and (retain_until is null or retain_until > now())
    and (not p_hwp or plan_charge <> 'free')
    and (p_charge <> 'teacher' or plan_charge <> 'free')
  order by (plan_charge <> 'free') desc, created_at desc limit 1;
  if found then
    return to_jsonb(j);
  end if;
  -- 파일 생성 전 서버가 고른 값은 스냅샷이다. 시험지와 같은 잠금 안에서 다시 선택한다.
  -- 한글은 무료를 건너뛰며, 실패 후 미제공 작업만 환급한다.
  if p_kind='print' and p_charge<>'teacher' then
    select count(*) into used from public.feature_usage u
      where u.user_id=p_user and u.feature='plan_free_bundle' and u.created_at<=now()
        and not exists (select 1 from public.pdf_jobs f where f.id::text=u.title
          and f.user_id=p_user and f.status='error' and not f.hwp_ready and not f.pdf_delivered);
    if not p_hwp and used<2 then
      p_charge := 'free';
    else
      for exam_purchase in select created_at from public.purchased_items
        where user_id=p_user and item_type='QB_EXAM' and created_at<=now() order by created_at,id
      loop
        if exam_until is null or exam_purchase.created_at>=exam_until then
          exam_start := exam_purchase.created_at;
          exam_until := exam_purchase.created_at;
          exam_granted := 0;
        end if;
        exam_until := exam_until+interval '14 days';
        exam_granted := exam_granted+10;
      end loop;
      select count(*) into used from public.feature_usage u
        where u.user_id=p_user and u.feature in ('plan_exam_exam','plan_exam_bundle')
          and u.created_at>=exam_start and u.created_at<=now()
          and not exists (select 1 from public.pdf_jobs f where f.id::text=u.title
            and f.user_id=p_user and f.status='error' and not f.hwp_ready and not f.pdf_delivered);
      if exam_until>now() and used<exam_granted then
        p_charge := 'exam';
      else
        select count(*) into once_total from public.purchased_items
          where user_id=p_user and item_type='QB_ONCE' and created_at<=now();
        select count(*) into used from public.feature_usage u
          where u.user_id=p_user and u.feature='plan_once_bundle' and u.created_at<=now()
            and not exists (select 1 from public.pdf_jobs f where f.id::text=u.title
              and f.user_id=p_user and f.status='error' and not f.hwp_ready and not f.pdf_delivered);
        if used>=once_total then raise exception 'PLAN_LIMIT'; end if;
        p_charge := 'once';
      end if;
    end if;
  end if;
  -- 예상문제: 기간 중 시험대비권도 무제한. 프린트 건수는 사용하지 않는다.
  if p_charge <> 'teacher' and not (p_kind = 'predict' and p_charge = 'exam') then
    feature_name := 'plan_' || p_charge || '_' || case when p_kind = 'print' then 'bundle' else 'predict' end;
    if p_kind = 'predict' and p_charge = 'free' then
      -- 사용자별 잠금 안에서 일/주 한도를 모두 재확인한다. 클라이언트/서버 스냅샷에 의존하지 않는다.
      day_start := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
      week_start := date_trunc('week', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
      if exists (
        select 1 from public.feature_usage u
        where u.user_id = p_user and u.feature = 'plan_free_predict' and u.created_at >= week_start and u.created_at <= now()
          and not exists (select 1 from public.pdf_jobs f where f.id::text = u.title
            and f.user_id = p_user and f.status = 'error' and not f.hwp_ready and not f.pdf_delivered)
        having count(*) filter (where u.created_at >= day_start) >= 1 or count(*) >= 3
      ) then raise exception 'PLAN_LIMIT'; end if;
    elsif p_kind <> 'print' then
      select count(*) into used from public.feature_usage u
      where u.user_id = p_user and u.feature = any(case when p_charge = 'exam'
          then array['plan_exam_exam','plan_exam_bundle'] else p_features end)
        and (p_since is null or u.created_at >= p_since)
        and u.created_at <= now()
        and not exists (select 1 from public.pdf_jobs f where f.id::text = u.title
          and f.user_id = p_user and f.status = 'error' and not f.hwp_ready and not f.pdf_delivered);
      if p_limit is null or used >= p_limit then raise exception 'PLAN_LIMIT'; end if;
    end if;
  end if;
  insert into public.pdf_jobs(id,user_id,kind,title,stamp,question_ids,set_hash,plan_charge,retain_until,hwp_ready,receipt_id)
    values(p_id,p_user,p_kind,p_title,p_charge = 'free',p_ids,p_hash,p_charge,
      case when p_kind = 'print' and p_charge <> 'free' then now() + interval '30 days' else null end,false,p_receipt)
    returning * into j;
  if p_charge <> 'teacher' and not (p_kind = 'predict' and p_charge = 'exam') then
    insert into public.feature_usage(user_id,user_email,feature,title,question_count,set_hash)
      values(p_user,p_email,feature_name,p_id::text,cardinality(p_ids),p_hash);
  end if;
  return to_jsonb(j);
end;
$$;
revoke all on function public.create_plan_bundle(uuid,uuid,text,text,text,uuid[],text,text,boolean,text[],int,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.create_plan_bundle(uuid,uuid,text,text,text,uuid[],text,text,boolean,text[],int,timestamptz,uuid) to service_role;

-- HML 업로드 후 접수한다. 같은 회원·보관함 시험지의 진행 작업은 잠금 안에서 재사용한다.
-- set_hash는 exam에서는 보관함 examId이며 print/predict의 문항 해시와 kind로 구분된다.
create or replace function public.create_exam_pdf_job(p_id uuid,p_user uuid,p_exam uuid,p_title text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.pdf_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended('exam_pdf:'||p_user::text||':'||p_exam::text,81108));
  select * into j from public.pdf_jobs
    where user_id=p_user and kind='exam' and set_hash=p_exam::text and status in ('pending','working')
    order by created_at desc limit 1;
  if found then return to_jsonb(j); end if;
  insert into public.pdf_jobs(id,user_id,kind,title,stamp,set_hash)
    values(p_id,p_user,'exam',p_title,false,p_exam::text) returning * into j;
  return to_jsonb(j);
end;
$$;
revoke all on function public.create_exam_pdf_job(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.create_exam_pdf_job(uuid,uuid,uuid,text) to service_role;

-- 환급된 작업은 같은 잠금 안에서 거절한다. 이후 요청은 새 차감으로 생성한다.
create or replace function public.claim_bundle_hwp(p_user uuid,p_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.pdf_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,81108));
  select * into j from public.pdf_jobs where id=p_id and user_id=p_user for update;
  if not found or j.plan_charge='free' or (j.retain_until is not null and j.retain_until<=now())
    or (j.status='error' and not j.hwp_ready and not j.pdf_delivered) then raise exception 'BUNDLE_UNAVAILABLE'; end if;
  update public.pdf_jobs set hwp_ready=true where id=j.id returning * into j;
  return to_jsonb(j);
end;
$$;
revoke all on function public.claim_bundle_hwp(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_bundle_hwp(uuid,uuid) to service_role;

-- 실제 한글 준비 실패 때만 미제공 예약을 환급한다. 이미 제공한 PDF/한글의 차감은 보존한다.
create or replace function public.fail_bundle_hwp(p_user uuid,p_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,81108));
  update public.pdf_jobs set status='error'
    where id=p_id and user_id=p_user and not hwp_ready and not pdf_delivered and status<>'done';
end;
$$;
revoke all on function public.fail_bundle_hwp(uuid,uuid) from public,anon,authenticated;
grant execute on function public.fail_bundle_hwp(uuid,uuid) to service_role;

-- 워커의 done 이력은 복원 실패 뒤에도 유지한다. 이전 워커도 이 트리거를 통과한다.
create or replace function public.keep_pdf_delivery() returns trigger language plpgsql as $$
begin
  new.pdf_delivered := old.pdf_delivered or coalesce(old.status='done',false) or coalesce(new.status='done',false);
  return new;
end;
$$;
drop trigger if exists keep_pdf_delivery on public.pdf_jobs;
create trigger keep_pdf_delivery before update on public.pdf_jobs for each row execute function public.keep_pdf_delivery();
-- 과거 done 이력도 같은 CORE 트랜잭션에서 보존한다.
update public.pdf_jobs set pdf_delivered=true where status='done' and not pdf_delivered;


-- 1장권의 구매별 사용 기록. 시험지를 보관함에서 삭제해도 이 기록은 남는다.
-- 대량 이력 복사 없이 원본 qb_usage를 실시간 합산한다.
alter table public.feature_usage add column if not exists qb_sheet_purchase_id text;

create table if not exists public.qb_save_requests (
  user_id uuid not null, request_id uuid not null, fingerprint text not null, result jsonb not null,
  primary key(user_id,request_id)
);
alter table public.qb_save_requests enable row level security;
revoke all on public.qb_save_requests from public,anon,authenticated;
grant all on public.qb_save_requests to service_role;
-- Match qbPass.passUntilFrom: early renewals stack; gaps restart the period.
-- Only the legacy qb_usage fallback is filtered. Explicit plan_* receipts remain authoritative.
create or replace view public.plan_usage as
with recursive teacher_purchases as (
  select user_id,created_at,
    row_number() over (partition by user_id order by created_at,id) as n,
    case item_id::text
      when '7b0c6f2e-30da-4a5e-9c11-000000000090' then interval '90 days'
      when '7b0c6f2e-30da-4a5e-9c11-000000000180' then interval '180 days'
      when '7b0c6f2e-30da-4a5e-9c11-000000000360' then interval '360 days'
      else interval '30 days' end as term
  from public.purchased_items where item_type='QB_PASS'
), teacher_periods as (
  select user_id,n,created_at as starts_at,created_at+term as until_at
    from teacher_purchases where n=1
  union all
  select p.user_id,p.n,greatest(p.created_at,t.until_at),greatest(p.created_at,t.until_at)+p.term
    from teacher_purchases p join teacher_periods t on p.user_id=t.user_id and p.n=t.n+1
)
select id,user_id,feature,title,created_at,qb_sheet_purchase_id from public.feature_usage
union all
select q.id,q.user_id,'plan_free_exam',q.exam_id::text,q.created_at,null::text
from public.qb_usage q where not exists (
  select 1 from public.feature_usage u where u.user_id=q.user_id
  and u.feature in ('plan_free_exam','plan_sheet_exam','plan_teacher_exam','plan_exam_exam')
  and (u.title=q.exam_id::text or (u.title is null and u.created_at=q.created_at))
)
and not exists (
  select 1 from teacher_periods t where t.user_id=q.user_id
    and q.created_at>=t.starts_at and q.created_at<t.until_at
);
revoke all on public.plan_usage from public,anon,authenticated;
grant select on public.plan_usage to service_role;
-- 같은 사용자 잠금(81108)을 프린트·예상과 공유. 저장 성공과 사용 확정을 한 트랜잭션으로 묶는다.
-- p_charge는 서버의 권한 검사값. 무료→시험대비권→1장권의 실제 선택은 잠금 안에서 다시 한다.
create or replace function public.save_plan_exam_item(
  p_user_id uuid, p_folder_id uuid, p_name text, p_reference_id uuid, p_details jsonb,
  p_session_id uuid, p_track boolean, p_limit int,
  p_charge text, p_email text, p_plan_limit int, p_plan_since timestamptz
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  result jsonb;
  actual_charge text;
  used int;
  week_start timestamptz;
  purchase_id text;
  exam_purchase record;
  exam_start timestamptz;
  exam_until timestamptz;
  exam_granted int := 0;
begin
  if p_charge is null or p_charge not in ('free','exam','sheet','teacher') then raise exception 'INVALID_PLAN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,81108));
  if p_details->>'request_id' is not null then
    select r.result into result from public.qb_save_requests r
      where r.user_id=p_user_id and r.request_id=(p_details->>'request_id')::uuid;
    if found then
      if not exists (select 1 from public.qb_save_requests r where r.user_id=p_user_id
        and r.request_id=(p_details->>'request_id')::uuid and r.fingerprint=p_details->>'request_fingerprint')
        then raise exception 'REQUEST_MISMATCH'; end if;
      return result;
    end if;
  end if;
  actual_charge := p_charge;
  if p_charge <> 'teacher' then
    week_start := date_trunc('week',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
    select count(*) into used from public.plan_usage
      where user_id=p_user_id and feature='plan_free_exam' and created_at>=week_start and created_at<=now();
    if used < 2 then
      actual_charge := 'free';
    else
      -- 기간 중 추가 구매는 14일·10건 누적, 기간이 끊기면 이전 잔여 건수는 소멸한다.
      for exam_purchase in select created_at from public.purchased_items
        where user_id=p_user_id and item_type='QB_EXAM' and created_at<=now() order by created_at,id
      loop
        if exam_until is null or exam_purchase.created_at>=exam_until then
          exam_start := exam_purchase.created_at;
          exam_until := exam_purchase.created_at;
          exam_granted := 0;
        end if;
        exam_until := exam_until+interval '14 days';
        exam_granted := exam_granted+10;
      end loop;
      select count(*) into used from public.feature_usage u
        where u.user_id=p_user_id and u.feature in ('plan_exam_exam','plan_exam_bundle')
          and u.created_at>=exam_start and u.created_at<=now()
          and not exists (select 1 from public.pdf_jobs f where f.id::text=u.title
            and f.user_id=p_user_id and f.status='error' and not f.hwp_ready and not f.pdf_delivered);
      if exam_until>now() and used<exam_granted then
        actual_charge := 'exam';
      else
        select b.id::text into purchase_id from public.purchased_items b
          where b.user_id=p_user_id and b.item_type='QB_SHEET'
            and b.created_at<=now() and b.created_at+interval '30 days'>now()
            and not exists (select 1 from public.feature_usage u where u.qb_sheet_purchase_id=b.id::text)
          order by b.created_at,b.id limit 1;
        if not found then raise exception 'PLAN_LIMIT'; end if;
        actual_charge := 'sheet';
      end if;
    end if;
  end if;
  if coalesce((p_details->>'question_count')::int,0) not between 1 and
    (case when actual_charge='teacher' then 100 else 50 end) then raise exception 'INVALID_QUESTIONS'; end if;
  result := public.save_exam_item(p_user_id,p_folder_id,p_name,p_reference_id,
    p_details || jsonb_build_object('plan',actual_charge,'pdf_only',false,
      'redownload_until',now()+interval '30 days'),p_session_id,p_track,
    case when actual_charge='teacher' then least(coalesce(p_limit,50),50) else 20 end);
  insert into public.feature_usage(user_id,user_email,feature,title,question_count,qb_sheet_purchase_id)
    values(p_user_id,p_email,'plan_'||actual_charge||'_exam',result->>'id',
      (p_details->>'question_count')::int,purchase_id);
  insert into public.qb_usage(user_id,exam_id) values(p_user_id,(result->>'id')::uuid);
  insert into public.exam_save_proofs(item_id,user_id,reference_id,hml_path)
    values((result->>'id')::uuid,p_user_id,p_reference_id,p_details->>'hml_path');
  if p_details->>'request_id' is not null then
    insert into public.qb_save_requests(user_id,request_id,fingerprint,result)
      values(p_user_id,(p_details->>'request_id')::uuid,p_details->>'request_fingerprint',result);
  end if;
  return result;
end;
$$;
revoke all on function public.save_plan_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean,int,text,text,int,timestamptz) from public,anon,authenticated;
grant execute on function public.save_plan_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean,int,text,text,int,timestamptz) to service_role;
notify pgrst, 'reload schema';
commit;
-- END REQUEST CORE

-- CONCURRENT INDEX SECTION: OUTSIDE TRANSACTIONS, one statement per API request.
-- Do not submit the entire file as one request or wrap this section in BEGIN/COMMIT.
-- REQUEST INDEX_1
create index concurrently if not exists pdf_jobs_bundle on public.pdf_jobs(user_id, kind, set_hash, created_at desc);
-- END REQUEST INDEX_1

-- REQUEST INDEX_2
create index concurrently if not exists feature_usage_plan_user on public.feature_usage(user_id, feature, created_at);
-- END REQUEST INDEX_2

-- REQUEST INDEX_3
create index concurrently if not exists bundle_selections_user on public.bundle_selections(user_id,created_at);
-- END REQUEST INDEX_3

-- REQUEST INDEX_4
create unique index concurrently if not exists feature_usage_qb_sheet_purchase
  on public.feature_usage(qb_sheet_purchase_id) where qb_sheet_purchase_id is not null;
-- END REQUEST INDEX_4

