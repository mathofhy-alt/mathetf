-- Requires the deployed 20261108_plans_final schema. Apply after
-- payment_supersede and before enabling payment_schedule.
BEGIN;
-- Upgrade the deployed 11/8 plan RPC before cancellation can delete a purchase.
-- Usage keeps the purchase ID as an audit reference, deliberately without a
-- cascading FK. Removing A must never spend a credit subsequently bought as B.
SET LOCAL lock_timeout='3s';
LOCK TABLE public.feature_usage,public.purchased_items,public.pdf_jobs IN SHARE ROW EXCLUSIVE MODE;
-- Freeze each extension before cancellation can remove a preceding purchase.
-- No FK to the predecessor: B's confirmed end survives a full refund of A.
ALTER TABLE public.purchased_items ADD COLUMN plan_starts_at timestamptz, ADD COLUMN plan_ends_at timestamptz;
DO $$
DECLARE b record; previous_user uuid; previous_type text; until_at timestamptz; starts_at timestamptz; term interval;
BEGIN
  FOR b IN SELECT * FROM public.purchased_items WHERE item_type IN ('QB_PASS','QB_EXAM')
    ORDER BY user_id,item_type,created_at,id
  LOOP
    IF previous_user IS DISTINCT FROM b.user_id OR previous_type IS DISTINCT FROM b.item_type THEN until_at:=NULL; END IF;
    term:=CASE WHEN b.item_type='QB_EXAM' THEN interval '14 days' ELSE
      CASE b.item_id::text
        WHEN '7b0c6f2e-30da-4a5e-9c11-000000000090' THEN interval '90 days'
        WHEN '7b0c6f2e-30da-4a5e-9c11-000000000180' THEN interval '180 days'
        WHEN '7b0c6f2e-30da-4a5e-9c11-000000000360' THEN interval '360 days'
        ELSE interval '30 days' END END;
    starts_at:=greatest(b.created_at,until_at); until_at:=starts_at+term;
    UPDATE public.purchased_items SET plan_starts_at=starts_at,plan_ends_at=until_at WHERE id=b.id;
    previous_user:=b.user_id; previous_type:=b.item_type;
  END LOOP;
END; $$;
CREATE FUNCTION public.freeze_plan_purchase_period() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE until_at timestamptz; term interval;
BEGIN
  IF TG_OP='UPDATE' THEN
    NEW.plan_starts_at:=OLD.plan_starts_at; NEW.plan_ends_at:=OLD.plan_ends_at;
  ELSIF NEW.item_type IN ('QB_PASS','QB_EXAM') THEN
    -- Old completion INSERTs and the modern RPC both take this member lock.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,81108));
    SELECT max(plan_ends_at) INTO until_at FROM public.purchased_items
      WHERE user_id=NEW.user_id AND item_type=NEW.item_type AND created_at<=NEW.created_at;
    term:=CASE WHEN NEW.item_type='QB_EXAM' THEN interval '14 days' ELSE
      CASE NEW.item_id::text
        WHEN '7b0c6f2e-30da-4a5e-9c11-000000000090' THEN interval '90 days'
        WHEN '7b0c6f2e-30da-4a5e-9c11-000000000180' THEN interval '180 days'
        WHEN '7b0c6f2e-30da-4a5e-9c11-000000000360' THEN interval '360 days'
        ELSE interval '30 days' END END;
    NEW.plan_starts_at:=greatest(NEW.created_at,until_at); NEW.plan_ends_at:=NEW.plan_starts_at+term;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER freeze_plan_purchase_period BEFORE INSERT OR UPDATE ON public.purchased_items
  FOR EACH ROW EXECUTE FUNCTION public.freeze_plan_purchase_period();
ALTER TABLE public.feature_usage ADD COLUMN qb_once_purchase_id text, ADD COLUMN qb_exam_purchase_id text;
ALTER TABLE public.pdf_jobs ADD COLUMN revoked_at timestamptz, ADD COLUMN revoked_payment_id text,
  ADD COLUMN authorization_purchase_ids text[] NOT NULL DEFAULT '{}';
CREATE INDEX feature_usage_once_purchase ON public.feature_usage(user_id,qb_once_purchase_id)
  WHERE feature='plan_once_bundle';
-- Pair old live usage FIFO with purchases that already existed at that usage.
-- Orphaned history cannot consume a later purchase. Failed, undelivered jobs
-- remain in the audit log but do not reserve a credit.
DO $$
DECLARE u record; purchase_id text;
BEGIN
  FOR u IN SELECT f.* FROM public.feature_usage f
    WHERE f.feature='plan_once_bundle' AND f.qb_once_purchase_id IS NULL
    ORDER BY f.created_at,f.id
  LOOP
    SELECT b.id::text INTO purchase_id FROM public.purchased_items b
      WHERE b.user_id=u.user_id AND b.item_type='QB_ONCE' AND b.created_at<=u.created_at
        AND NOT EXISTS(SELECT 1 FROM public.feature_usage used
          WHERE used.user_id=u.user_id AND used.feature='plan_once_bundle' AND used.qb_once_purchase_id=b.id::text
            AND NOT EXISTS(SELECT 1 FROM public.pdf_jobs j WHERE j.id::text=used.title
              AND j.user_id=used.user_id AND j.status='error' AND NOT j.hwp_ready AND NOT j.pdf_delivered))
      ORDER BY b.created_at,b.id LIMIT 1;
    UPDATE public.feature_usage SET qb_once_purchase_id=purchase_id WHERE id=u.id;
  END LOOP;
END; $$;

create or replace view public.plan_usage as
with teacher_periods as (
  -- Stacked credits/access remain available from purchase, as deployed. The
  -- frozen extension end cannot shrink when a preceding purchase is removed.
  select user_id,created_at as starts_at,plan_ends_at as until_at
    from public.purchased_items where item_type='QB_PASS'
)
select id,user_id,feature,title,created_at,qb_sheet_purchase_id,qb_once_purchase_id,qb_exam_purchase_id from public.feature_usage
union all
select q.id,q.user_id,'plan_free_exam',q.exam_id::text,q.created_at,null::text,null::text,null::text
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
-- These IDs describe a continuous period, not exclusive credit ownership.
-- Keep multiple sources for unlimited work and old, ambiguous reservations.
CREATE FUNCTION public.bundle_plan_purchases(p_user uuid,p_charge text,p_at timestamptz)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b record; until_at timestamptz; ids text[]:='{}';
BEGIN
  FOR b IN SELECT id::text,created_at,plan_ends_at FROM public.purchased_items
    WHERE user_id=p_user AND item_type=CASE p_charge WHEN 'teacher' THEN 'QB_PASS' WHEN 'exam' THEN 'QB_EXAM' END
      AND created_at<=p_at ORDER BY created_at,id
  LOOP
    IF until_at IS NULL OR b.created_at>=until_at THEN until_at:=b.created_at; ids:='{}'; END IF;
    until_at:=greatest(until_at,b.plan_ends_at); ids:=array_append(ids,b.id);
  END LOOP;
  RETURN CASE WHEN until_at>p_at THEN ids ELSE '{}'::text[] END;
END; $$;
REVOKE ALL ON FUNCTION public.bundle_plan_purchases(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bundle_plan_purchases(uuid,text,timestamptz) TO service_role;

-- Exam saves and prints share ten credits per purchase. Explicit attribution
-- survives cancellation; an A usage must never consume B after A is removed.
CREATE FUNCTION public.next_exam_purchase(p_user uuid,p_at timestamptz) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ids text[]; b record; used int; unlinked int; starts_at timestamptz;
BEGIN
  ids:=public.bundle_plan_purchases(p_user,'exam',p_at);
  SELECT min(created_at) INTO starts_at FROM public.purchased_items WHERE id::text=ANY(ids) AND user_id=p_user;
  SELECT count(*) INTO unlinked FROM public.feature_usage u
    WHERE u.user_id=p_user AND u.feature IN ('plan_exam_exam','plan_exam_bundle')
      AND u.qb_exam_purchase_id IS NULL AND u.created_at>=starts_at AND u.created_at<=p_at
      AND NOT EXISTS(SELECT 1 FROM public.pdf_jobs j WHERE j.id::text=u.title AND j.user_id=p_user
        AND j.status='error' AND NOT j.hwp_ready AND NOT j.pdf_delivered);
  FOR b IN SELECT id::text FROM public.purchased_items WHERE user_id=p_user AND id::text=ANY(ids) ORDER BY created_at,id
  LOOP
    SELECT count(*) INTO used FROM public.feature_usage u
      WHERE u.user_id=p_user AND u.feature IN ('plan_exam_exam','plan_exam_bundle')
        AND u.qb_exam_purchase_id=b.id AND u.created_at<=p_at
        AND NOT EXISTS(SELECT 1 FROM public.pdf_jobs j WHERE j.id::text=u.title AND j.user_id=p_user
          AND j.status='error' AND NOT j.hwp_ready AND NOT j.pdf_delivered);
    IF used+unlinked<10 THEN RETURN b.id; END IF;
    unlinked:=greatest(0,unlinked-greatest(0,10-used));
  END LOOP;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.next_exam_purchase(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.next_exam_purchase(uuid,timestamptz) TO service_role;
CREATE INDEX feature_usage_exam_purchase ON public.feature_usage(user_id,qb_exam_purchase_id)
  WHERE feature IN ('plan_exam_exam','plan_exam_bundle');
-- Historical FIFO is accounting evidence only. Keep the original job's full
-- period sources below, so an inferred allocation cannot authorize revocation.
DO $$
DECLARE u record; purchase_id text;
BEGIN
  FOR u IN SELECT * FROM public.feature_usage WHERE feature IN ('plan_exam_exam','plan_exam_bundle') ORDER BY created_at,id
  LOOP
    SELECT b.id::text INTO purchase_id FROM public.purchased_items b
      WHERE b.user_id=u.user_id AND b.id::text=ANY(public.bundle_plan_purchases(u.user_id,'exam',u.created_at))
        AND (SELECT count(*) FROM public.feature_usage f WHERE f.user_id=u.user_id AND f.qb_exam_purchase_id=b.id::text
          AND NOT EXISTS(SELECT 1 FROM public.pdf_jobs j WHERE j.user_id=f.user_id AND j.id::text=f.title
            AND j.status='error' AND NOT j.hwp_ready AND NOT j.pdf_delivered))<10
      ORDER BY b.created_at,b.id LIMIT 1;
    UPDATE public.feature_usage SET qb_exam_purchase_id=purchase_id WHERE id=u.id;
  END LOOP;
END; $$;

UPDATE public.pdf_jobs j SET authorization_purchase_ids=public.bundle_plan_purchases(j.user_id,j.plan_charge,j.created_at)
  WHERE j.plan_charge IN ('exam','teacher');
UPDATE public.pdf_jobs j SET authorization_purchase_ids=ARRAY(
  SELECT DISTINCT coalesce(u.qb_once_purchase_id,u.qb_sheet_purchase_id) FROM public.feature_usage u
  WHERE u.user_id=j.user_id AND u.title=j.id::text AND coalesce(u.qb_once_purchase_id,u.qb_sheet_purchase_id) IS NOT NULL)
  WHERE j.plan_charge='once';

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
  once_purchase_id text;
  exam_purchase_id text;
  purchase_ids text[]:='{}';
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
    and revoked_at is null
    and (status <> 'error' or hwp_ready or pdf_delivered)
    and (retain_until is null or retain_until > now())
    and (not p_hwp or plan_charge <> 'free')
    and (p_charge <> 'teacher' or plan_charge <> 'free')
  order by (plan_charge <> 'free') desc, created_at desc limit 1;
  if found then
    return to_jsonb(j);
  end if;
  -- Never trust the entitlement snapshot read before HML generation/upload.
  -- Cancellation uses this same 81108 member lock before deleting purchases.
  IF p_charge='teacher' THEN
    purchase_ids:=public.bundle_plan_purchases(p_user,'teacher',now());
    IF cardinality(purchase_ids)=0 AND NOT EXISTS(
      SELECT 1 FROM auth.users a WHERE a.id=p_user AND to_jsonb(a)->>'email'='mathofhy@naver.com'
    ) THEN RAISE EXCEPTION 'PLAN_LIMIT'; END IF;
  ELSIF p_kind='predict' AND p_charge='exam' THEN
    purchase_ids:=public.bundle_plan_purchases(p_user,'exam',now());
    IF cardinality(purchase_ids)=0 THEN RAISE EXCEPTION 'PLAN_LIMIT'; END IF;
  END IF;
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
      exam_purchase_id:=public.next_exam_purchase(p_user,now());
      if exam_purchase_id IS NOT NULL then
        p_charge := 'exam';
      else
        select b.id::text into once_purchase_id from public.purchased_items b
          where b.user_id=p_user and b.item_type='QB_ONCE' and b.created_at<=now()
            and not exists (select 1 from public.feature_usage u
              where u.user_id=p_user and u.feature='plan_once_bundle' and u.qb_once_purchase_id=b.id::text
                and u.created_at<=now()
                and not exists (select 1 from public.pdf_jobs f where f.id::text=u.title
                  and f.user_id=p_user and f.status='error' and not f.hwp_ready and not f.pdf_delivered))
          order by b.created_at,b.id limit 1;
        if not found then raise exception 'PLAN_LIMIT'; end if;
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
  IF p_charge='exam' AND p_kind='print' THEN purchase_ids:=ARRAY[exam_purchase_id];
  ELSIF p_charge='exam' THEN purchase_ids:=public.bundle_plan_purchases(p_user,'exam',now());
  ELSIF p_charge='once' THEN purchase_ids:=ARRAY[once_purchase_id]; END IF;
  insert into public.pdf_jobs(id,user_id,kind,title,stamp,question_ids,set_hash,plan_charge,retain_until,hwp_ready,receipt_id,authorization_purchase_ids)
    values(p_id,p_user,p_kind,p_title,p_charge = 'free',p_ids,p_hash,p_charge,
      case when p_kind = 'print' and p_charge <> 'free' then now() + interval '30 days' else null end,false,p_receipt,purchase_ids)
    returning * into j;
  if p_charge <> 'teacher' and not (p_kind = 'predict' and p_charge = 'exam') then
    insert into public.feature_usage(user_id,user_email,feature,title,question_count,set_hash,qb_once_purchase_id,qb_exam_purchase_id)
      values(p_user,p_email,feature_name,p_id::text,cardinality(p_ids),p_hash,once_purchase_id,exam_purchase_id);
  end if;
  return to_jsonb(j);
end;
$$;
revoke all on function public.create_plan_bundle(uuid,uuid,text,text,text,uuid[],text,text,boolean,text[],int,timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.create_plan_bundle(uuid,uuid,text,text,text,uuid[],text,text,boolean,text[],int,timestamptz,uuid) to service_role;

-- Preserve the deployed save signature, request replay and free/sheet policy.
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
  exam_purchase_id text;
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
  if p_charge = 'teacher' then
    -- The API snapshot predates file generation. Cancellation takes this same
    -- member lock, so only a current purchase (or the real admin) can save.
    if cardinality(public.bundle_plan_purchases(p_user_id,'teacher',clock_timestamp()))=0
      and not exists(select 1 from auth.users a where a.id=p_user_id
        and to_jsonb(a)->>'email'='mathofhy@naver.com') then raise exception 'PLAN_LIMIT'; end if;
  else
    week_start := date_trunc('week',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
    select count(*) into used from public.plan_usage
      where user_id=p_user_id and feature='plan_free_exam' and created_at>=week_start and created_at<=now();
    if used < 2 then
      actual_charge := 'free';
    else
      exam_purchase_id:=public.next_exam_purchase(p_user_id,now());
      if exam_purchase_id is not null then
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
  insert into public.feature_usage(user_id,user_email,feature,title,question_count,qb_sheet_purchase_id,qb_exam_purchase_id)
    values(p_user_id,p_email,'plan_'||actual_charge||'_exam',result->>'id',
      (p_details->>'question_count')::int,purchase_id,exam_purchase_id);
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

-- File delivery and cancellation share the credit lock. Keep usage and worker
-- history, but never reactivate a refunded reservation (including old workers).
CREATE FUNCTION public.guard_revoked_bundle() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  NEW.authorization_purchase_ids:=OLD.authorization_purchase_ids;
  IF OLD.revoked_at IS NOT NULL THEN
    NEW.revoked_at:=OLD.revoked_at; NEW.revoked_payment_id:=OLD.revoked_payment_id;
    IF (NEW.hwp_ready AND NOT OLD.hwp_ready) OR (NEW.pdf_delivered AND NOT OLD.pdf_delivered)
      OR NEW.status IS DISTINCT FROM OLD.status
      THEN RAISE EXCEPTION 'BUNDLE_REVOKED'; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER guard_revoked_bundle BEFORE UPDATE ON public.pdf_jobs
  FOR EACH ROW EXECUTE FUNCTION public.guard_revoked_bundle();

CREATE OR REPLACE FUNCTION public.claim_bundle_hwp(p_user uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.pdf_jobs;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,81108));
  SELECT * INTO j FROM public.pdf_jobs WHERE id=p_id AND user_id=p_user FOR UPDATE;
  IF NOT FOUND OR j.revoked_at IS NOT NULL OR j.plan_charge='free'
    OR (j.retain_until IS NOT NULL AND j.retain_until<=now())
    OR (j.status='error' AND NOT j.hwp_ready AND NOT j.pdf_delivered) THEN RAISE EXCEPTION 'BUNDLE_UNAVAILABLE'; END IF;
  UPDATE public.pdf_jobs SET hwp_ready=true WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
END; $$;
REVOKE ALL ON FUNCTION public.claim_bundle_hwp(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_bundle_hwp(uuid,uuid) TO service_role;

-- Recheck immediately before returning a signed PDF/HWP. Read-only entitlement
-- confirmation also works for old stored jobs that have no usage link.
CREATE FUNCTION public.check_bundle_delivery(p_user uuid,p_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user::text,81108));
  -- Only the cancellation transaction may revoke an exclusive undelivered job.
  -- Missing one historical source cannot override its conservative decision.
  RETURN EXISTS(SELECT 1 FROM public.pdf_jobs j WHERE id=p_id AND user_id=p_user AND revoked_at IS NULL);
END; $$;
REVOKE ALL ON FUNCTION public.check_bundle_delivery(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.check_bundle_delivery(uuid,uuid) TO service_role;

ALTER TABLE public.payment_orders ADD COLUMN legacy_resolution boolean NOT NULL DEFAULT false;
ALTER TABLE public.payment_orders ADD COLUMN unpaid_reconcile_checks integer NOT NULL DEFAULT 0;
ALTER TABLE public.payment_orders DROP CONSTRAINT payment_orders_status_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_status_check
  CHECK(status IN ('pending','completed','superseded','closed','cancelled'));

CREATE TABLE public.payment_review_decisions (
  payment_id text NOT NULL REFERENCES public.payment_orders(payment_id),
  action text NOT NULL CHECK(action IN ('fulfill','refund','close_review')),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  note text NOT NULL CHECK(length(trim(note))>=5),
  provider_evidence jsonb NOT NULL,
  ownership_attested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(payment_id,action)
);
CREATE TABLE public.payment_cancellations (
  payment_id text PRIMARY KEY REFERENCES public.payment_orders(payment_id),
  cancellation_id text,
  amount bigint NOT NULL,
  returned_points bigint NOT NULL,
  revoked_items jsonb NOT NULL,
  ledger_state text NOT NULL,
  bundle_review_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_review_decisions,public.payment_cancellations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.payment_review_decisions,public.payment_cancellations TO service_role;

-- Hiding a receipt must not erase fulfillment or revoke entitlements. This
-- per-user presentation state is deliberately separate from both old ledgers.
CREATE TABLE public.purchase_list_hides (
  user_id uuid NOT NULL REFERENCES auth.users(id),
  purchase_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,purchase_id)
);
ALTER TABLE public.purchase_list_hides ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_list_hides_owner ON public.purchase_list_hides FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.purchase_list_hides FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.purchase_list_hides TO authenticated,service_role;
CREATE FUNCTION public.hide_purchase(p_purchase_id uuid,p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.purchased_items WHERE id=p_purchase_id AND user_id=p_user_id)
    AND NOT EXISTS(SELECT 1 FROM public.purchases WHERE id=p_purchase_id AND user_id=p_user_id)
    THEN RAISE EXCEPTION 'Purchase owner mismatch'; END IF;
  INSERT INTO public.purchase_list_hides(user_id,purchase_id) VALUES(p_user_id,p_purchase_id) ON CONFLICT DO NOTHING;
END; $$;

-- Exact correspondence, including the point debit, is required before treating
-- an old pending row as delivered. A partial ledger never licenses another grant.
CREATE FUNCTION public.payment_order_ledger_state(p_payment_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; h integer; g integer; d integer;
BEGIN
  SELECT * INTO STRICT o FROM public.payment_orders WHERE payment_id=p_payment_id;
  SELECT count(*) INTO h FROM public.payment_history WHERE payment_id=p_payment_id;
  SELECT count(*) INTO g FROM public.purchased_items WHERE payment_id=p_payment_id;
  SELECT count(*) INTO d FROM public.point_transactions WHERE related_id=o.id AND type='purchase';
  IF h=0 AND g=0 AND d=0 THEN RETURN 'unfulfilled'; END IF;
  IF h<>1 OR g<>jsonb_array_length(o.items) OR d<>(CASE WHEN o.used_points>0 THEN 1 ELSE 0 END) THEN RETURN 'conflict'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.payment_history WHERE payment_id=p_payment_id
    AND user_id=o.user_id AND amount=o.amount AND points_added=0 AND status='PAID')
    OR EXISTS(SELECT 1 FROM public.purchased_items p WHERE p.payment_id=p_payment_id
      AND (p.user_id IS DISTINCT FROM o.user_id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) i
        WHERE i->>'item_id'=p.item_id AND i->>'item_type'=p.item_type AND (i->>'price')::bigint=p.price_paid)))
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) i WHERE NOT EXISTS(
      SELECT 1 FROM public.purchased_items p WHERE p.payment_id=p_payment_id AND p.item_id=i->>'item_id'))
    OR (o.used_points>0 AND NOT EXISTS(SELECT 1 FROM public.point_transactions
      WHERE related_id=o.id AND type='purchase' AND user_id=o.user_id AND amount=-o.used_points))
  THEN RETURN 'conflict'; END IF;
  RETURN 'fulfilled';
END; $$;

-- The caller has fetched PortOne, never a browser-supplied payment object.
-- This transaction serializes webhook cancellation with fulfillment/replacement.
CREATE FUNCTION public.record_payment_review(p_payment_id text,p_provider_status text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE owner_id uuid;
BEGIN
  IF p_reason IS NULL OR p_reason NOT IN ('partial_cancelled','provider_mismatch','provider_state')
    OR p_provider_status IS NULL OR length(p_provider_status)>64
    OR (p_reason='partial_cancelled' AND p_provider_status<>'PARTIAL_CANCELLED')
    THEN RAISE EXCEPTION 'Invalid review reason'; END IF;
  SELECT user_id INTO STRICT owner_id FROM public.payment_orders WHERE payment_id=p_payment_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||owner_id::text,0));
  UPDATE public.payment_orders SET provider_status=p_provider_status,provider_checked_at=now(),
    manual_review_required=true,review_reason=p_reason,reconcile_after=now()+interval '6 hours'
    WHERE payment_id=p_payment_id AND status IN ('pending','completed','superseded','closed') AND refund_status IS DISTINCT FROM 'succeeded';
END; $$;

CREATE FUNCTION public.record_payment_partial_cancellation(p_payment_id text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT public.record_payment_review(p_payment_id,'PARTIAL_CANCELLED','partial_cancelled');
$$;

CREATE FUNCTION public.record_payment_cancellation(p_payment_id text,p_cancellation_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; owner_id uuid; ledger text; returned bigint:=0; revoked jsonb;
  j public.pdf_jobs; review_jobs uuid[]:='{}';
BEGIN
  SELECT user_id INTO STRICT owner_id FROM public.payment_orders WHERE payment_id=p_payment_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||owner_id::text,0));
  -- Serialize credit consumption with revocation; audit usages keep their ID.
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text,81108));
  SELECT * INTO STRICT o FROM public.payment_orders WHERE payment_id=p_payment_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.payment_cancellations WHERE payment_id=p_payment_id) THEN RETURN; END IF;
  ledger:=public.payment_order_ledger_state(p_payment_id);
  -- A partial goods/history ledger does not authorize another delivery. For a
  -- verified full card cancellation, an exact debit is still sufficient proof
  -- to return that debit, once. Unproven point changes remain in the review box.
  IF ledger='fulfilled' OR (o.used_points>0
    AND (SELECT count(*) FROM public.point_transactions WHERE related_id=o.id AND type='purchase')=1
    AND EXISTS(SELECT 1 FROM public.point_transactions WHERE related_id=o.id AND type='purchase'
      AND user_id=o.user_id AND amount=-o.used_points)) THEN
    returned:=o.used_points;
    IF returned>0 THEN
      INSERT INTO public.profiles(id,earned_points) VALUES(o.user_id,returned)
        ON CONFLICT(id) DO UPDATE SET earned_points=coalesce(profiles.earned_points,0)+excluded.earned_points;
      INSERT INTO public.point_transactions(user_id,type,amount,description,related_id)
        VALUES(o.user_id,'payment_refund',returned,'카드 전액 취소: 사용 포인트 반환',o.id);
    END IF;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO revoked FROM public.purchased_items p WHERE payment_id=p_payment_id;
  -- Delivered work keeps the deployed access policy. Revoke only an exclusive
  -- undelivered reservation; shared or missing evidence goes to operator review.
  FOR j IN SELECT job.* FROM public.pdf_jobs job WHERE job.user_id=o.user_id
    AND job.revoked_at IS NULL AND NOT job.hwp_ready AND NOT job.pdf_delivered AND job.status IS DISTINCT FROM 'done' AND (
    EXISTS(SELECT 1 FROM public.purchased_items p
      WHERE p.payment_id=p_payment_id AND p.user_id=o.user_id AND p.id::text=ANY(job.authorization_purchase_ids))
    OR EXISTS(SELECT 1 FROM public.feature_usage u JOIN public.purchased_items p
      ON p.payment_id=p_payment_id AND p.user_id=o.user_id
        AND p.id::text IN (u.qb_once_purchase_id,u.qb_sheet_purchase_id,u.qb_exam_purchase_id)
      WHERE u.user_id=o.user_id AND u.title=job.id::text)
    OR (cardinality(job.authorization_purchase_ids)=0 AND EXISTS(SELECT 1 FROM public.purchased_items p
      WHERE p.payment_id=p_payment_id AND p.user_id=o.user_id AND p.created_at<=job.created_at
        AND p.item_type=CASE job.plan_charge WHEN 'exam' THEN 'QB_EXAM' WHEN 'teacher' THEN 'QB_PASS' WHEN 'once' THEN 'QB_ONCE' END)))
    -- A worker can finish without the member lock. Lock/recheck its row before
    -- deciding, so a delivery that committed first is never revoked here.
    FOR UPDATE OF job
  LOOP
    IF cardinality(j.authorization_purchase_ids)=1 AND EXISTS(SELECT 1 FROM public.purchased_items p
      WHERE p.payment_id=p_payment_id AND p.user_id=o.user_id AND p.id::text=ANY(j.authorization_purchase_ids))
      AND NOT ((j.plan_charge='teacher' OR (j.plan_charge='exam' AND j.kind='predict')) AND EXISTS(
        SELECT 1 FROM public.purchased_items p WHERE p.user_id=o.user_id AND p.payment_id IS DISTINCT FROM p_payment_id
          AND p.id::text=ANY(public.bundle_plan_purchases(o.user_id,j.plan_charge,clock_timestamp()))))
      AND NOT EXISTS(SELECT 1 FROM public.feature_usage u WHERE u.user_id=o.user_id AND u.title=j.id::text
        AND coalesce(u.qb_exam_purchase_id,u.qb_once_purchase_id,u.qb_sheet_purchase_id) IS NOT NULL
        AND NOT(coalesce(u.qb_exam_purchase_id,u.qb_once_purchase_id,u.qb_sheet_purchase_id)=ANY(j.authorization_purchase_ids))) THEN
      UPDATE public.pdf_jobs SET revoked_at=now(),revoked_payment_id=p_payment_id,status='error' WHERE id=j.id;
    ELSE review_jobs:=array_append(review_jobs,j.id);
    END IF;
  END LOOP;
  -- Keep download receipts so the legacy purchases fallback cannot resurrect a
  -- cancelled modern purchase. The download gate rejects their CANCELLED history.
  -- Passes and DB permissions are derived directly from these rows: remove them.
  DELETE FROM public.purchased_items WHERE payment_id=p_payment_id AND item_type NOT IN ('HWP_DOC','MOCK_EXAM');
  UPDATE public.payment_history SET status='CANCELLED' WHERE payment_id=p_payment_id;
  INSERT INTO public.payment_cancellations(payment_id,cancellation_id,amount,returned_points,revoked_items,ledger_state,bundle_review_ids)
    VALUES(p_payment_id,p_cancellation_id,o.amount,returned,revoked,ledger,review_jobs);
  UPDATE public.payment_orders SET status='cancelled',refund_status='succeeded',refunded_at=now(),
    refund_cancellation_id=p_cancellation_id,provider_status='CANCELLED',provider_checked_at=now(),
    -- Attribution review is informational: a confirmed refund must not block a
    -- fresh purchase. Real point/goods ledger conflicts keep their blocking flag.
    manual_review_required=(ledger='conflict' OR (o.status='completed' AND ledger<>'fulfilled')),
    review_reason=CASE WHEN cardinality(review_jobs)>0 THEN 'bundle_entitlement_review' ELSE review_reason END,
    reconcile_after=now()+interval '100 years' WHERE id=o.id;
END; $$;

-- Internal evidence for a zero-card order. Never query/fabricate PortOne PAID.
CREATE FUNCTION public.zero_payment_review_state(p_payment_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; ledger text; debit_count int; exact_debit boolean;
BEGIN
  SELECT * INTO STRICT o FROM public.payment_orders WHERE payment_id=p_payment_id;
  IF o.amount<>0 OR o.kind<>'cart' OR o.total<>o.used_points OR o.used_points<0
    OR o.total IS DISTINCT FROM (SELECT sum((i->>'price')::bigint) FROM jsonb_array_elements(o.items) i)
    THEN RAISE EXCEPTION 'Invalid zero-card order'; END IF;
  ledger:=public.payment_order_ledger_state(p_payment_id);
  SELECT count(*),coalesce(bool_and(user_id=o.user_id AND amount=-o.used_points),false)
    INTO debit_count,exact_debit FROM public.point_transactions WHERE related_id=o.id AND type='purchase';
  RETURN jsonb_build_object('ledger',ledger,'canFulfill',ledger IN ('fulfilled','unfulfilled')
      AND NOT EXISTS(SELECT 1 FROM public.point_transactions WHERE related_id=o.id AND type='payment_refund'),
    'canRefund',(debit_count=0 OR (debit_count=1 AND exact_debit))
      AND NOT EXISTS(SELECT 1 FROM public.point_transactions WHERE related_id=o.id AND type='payment_refund')
      AND NOT EXISTS(SELECT 1 FROM public.purchased_items WHERE payment_id=p_payment_id AND user_id IS DISTINCT FROM o.user_id)
      AND NOT EXISTS(SELECT 1 FROM public.payment_history WHERE payment_id=p_payment_id AND user_id IS DISTINCT FROM o.user_id),
    'returnPoints',CASE WHEN debit_count=1 AND exact_debit THEN o.used_points ELSE 0 END);
END; $$;

CREATE FUNCTION public.resolve_zero_payment(p_payment_id text,p_action text,p_actor_id uuid,p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; owner_id uuid; evidence jsonb; result jsonb;
BEGIN
  SELECT user_id INTO STRICT owner_id FROM public.payment_orders WHERE payment_id=p_payment_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||owner_id::text,0));
  SELECT * INTO STRICT o FROM public.payment_orders WHERE payment_id=p_payment_id FOR UPDATE;
  IF o.amount<>0 OR p_action NOT IN ('fulfill','refund') OR p_action IS NULL
    OR p_note IS NULL OR length(trim(p_note))<5 THEN RAISE EXCEPTION 'Invalid zero-card review'; END IF;
  IF EXISTS(SELECT 1 FROM public.payment_review_decisions WHERE payment_id=p_payment_id AND action=p_action) THEN
    RETURN jsonb_build_object('success',true,'refunded',o.status='cancelled','status',o.status);
  END IF;
  IF o.status<>'pending' OR NOT o.manual_review_required OR o.review_reason IS DISTINCT FROM 'ledger_conflict'
    THEN RAISE EXCEPTION 'Not an actionable zero-card review'; END IF;
  evidence:=public.zero_payment_review_state(p_payment_id);
  IF NOT (evidence->>CASE WHEN p_action='fulfill' THEN 'canFulfill' ELSE 'canRefund' END)::boolean
    THEN RAISE EXCEPTION 'Unproven internal ledger'; END IF;
  INSERT INTO public.payment_review_decisions(payment_id,action,actor_id,note,provider_evidence)
    VALUES(p_payment_id,p_action,p_actor_id,p_note,evidence||jsonb_build_object('source','internal_points'));
  IF p_action='refund' THEN
    PERFORM public.record_payment_cancellation(p_payment_id);
    UPDATE public.payment_orders SET manual_review_required=false WHERE payment_id=p_payment_id;
    RETURN jsonb_build_object('success',true,'refunded',true,'status','cancelled');
  END IF;
  UPDATE public.payment_orders SET manual_review_required=false,
    status=CASE WHEN evidence->>'ledger'='fulfilled' THEN 'completed' ELSE 'pending' END,
    completed_at=CASE WHEN evidence->>'ledger'='fulfilled' THEN now() ELSE completed_at END WHERE payment_id=p_payment_id;
  result:=public.complete_payment_order_v2(p_payment_id,owner_id);
  IF result->>'status' IS DISTINCT FROM 'completed' THEN RAISE EXCEPTION 'Cannot fulfill zero-card review'; END IF;
  RETURN result||jsonb_build_object('success',true);
END; $$;
REVOKE ALL ON FUNCTION public.zero_payment_review_state(text),public.resolve_zero_payment(text,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.zero_payment_review_state(text),public.resolve_zero_payment(text,text,uuid,text) TO service_role;

-- A verified cancellation can have a historical goods-ledger conflict (for
-- example a receipt deleted by the old UI). An operator may close that review
-- only after the actual debit/return pair and entitlement revocation agree.
CREATE FUNCTION public.close_payment_review(p_payment_id text,p_actor_id uuid,p_note text,
  p_payment jsonb,p_confirmed_owner boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; owner_id uuid; c public.payment_cancellations%ROWTYPE; custom jsonb;
BEGIN
  SELECT user_id INTO STRICT owner_id FROM public.payment_orders WHERE payment_id=p_payment_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||owner_id::text,0));
  SELECT * INTO STRICT o FROM public.payment_orders WHERE payment_id=p_payment_id FOR UPDATE;
  IF p_note IS NULL OR length(trim(p_note))<5 OR length(p_note)>1000 THEN RAISE EXCEPTION 'Review note required'; END IF;
  IF p_payment->>'id' IS DISTINCT FROM o.payment_id OR p_payment->>'currency' IS DISTINCT FROM 'KRW'
    OR (p_payment#>>'{amount,total}')::bigint IS DISTINCT FROM o.amount
    OR p_payment->>'status' IS DISTINCT FROM 'CANCELLED' THEN RAISE EXCEPTION 'Cancellation not verified'; END IF;
  custom:=p_payment->'customData';
  IF (p_payment#>>'{customer,id}' IS NOT NULL AND p_payment#>>'{customer,id}'<>o.user_id::text)
    OR (custom->>'orderId' IS NOT NULL AND custom->>'orderId'<>o.payment_id)
    OR ((NOT p_confirmed_owner OR NOT (o.legacy_reconciliation OR o.legacy_resolution))
      AND (p_payment#>>'{customer,id}' IS NULL OR custom->>'orderId' IS NULL))
    THEN RAISE EXCEPTION 'Owner verification required'; END IF;
  SELECT * INTO c FROM public.payment_cancellations WHERE payment_id=p_payment_id;
  IF NOT FOUND OR o.status<>'cancelled' OR o.refund_status IS DISTINCT FROM 'succeeded' OR c.amount<>o.amount
    THEN RAISE EXCEPTION 'Cancellation not recorded'; END IF;
  IF c.returned_points>0 THEN
    IF c.returned_points<>o.used_points
      OR (SELECT count(*) FROM public.point_transactions WHERE related_id=o.id AND type='purchase')<>1
      OR NOT EXISTS(SELECT 1 FROM public.point_transactions WHERE related_id=o.id AND type='purchase' AND user_id=o.user_id AND amount=-c.returned_points)
      OR (SELECT count(*) FROM public.point_transactions WHERE related_id=o.id AND type='payment_refund')<>1
      OR NOT EXISTS(SELECT 1 FROM public.point_transactions WHERE related_id=o.id AND type='payment_refund' AND user_id=o.user_id AND amount=c.returned_points)
      THEN RAISE EXCEPTION 'Point return not verified'; END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.point_transactions WHERE related_id=o.id AND type IN ('purchase','payment_refund'))
      OR (o.used_points>0 AND (o.completed_at IS NOT NULL OR c.ledger_state<>'unfulfilled'))
      THEN RAISE EXCEPTION 'Point ledger unresolved'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.payment_history WHERE payment_id=p_payment_id AND status IS DISTINCT FROM 'CANCELLED')
    OR EXISTS(SELECT 1 FROM public.purchased_items WHERE payment_id=p_payment_id AND item_type NOT IN ('HWP_DOC','MOCK_EXAM'))
    THEN RAISE EXCEPTION 'Entitlements not revoked'; END IF;
  INSERT INTO public.payment_review_decisions(payment_id,action,actor_id,note,provider_evidence,ownership_attested)
    VALUES(p_payment_id,'close_review',p_actor_id,trim(p_note),p_payment,p_confirmed_owner) ON CONFLICT DO NOTHING;
  UPDATE public.payment_orders SET manual_review_required=false,
    review_reason=CASE WHEN review_reason='bundle_entitlement_review' THEN NULL ELSE review_reason END WHERE id=o.id;
END; $$;

ALTER TABLE public.point_transactions DROP CONSTRAINT IF EXISTS point_transactions_type_check;
ALTER TABLE public.point_transactions ADD CONSTRAINT point_transactions_type_check CHECK(type IN
  ('charge','purchase','sale','settlement_request','settlement_refund','settlement_completed','submission_reward','payment_refund'));
CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_submission_reward_once
  ON public.point_transactions(related_id) WHERE type='submission_reward';
CREATE UNIQUE INDEX point_transactions_payment_refund_once
  ON public.point_transactions(related_id) WHERE type='payment_refund';

-- The operator reviews amount/owner/ledger evidence in the site. Missing old
-- identity metadata requires an explicit ownership attestation, recorded here;
-- conflicting metadata never authorizes action; partial ledgers cannot authorize
-- another delivery, but an explicit full cancellation remains available.
CREATE FUNCTION public.resolve_legacy_payment(p_payment_id text,p_action text,p_actor_id uuid,
  p_note text,p_payment jsonb,p_confirmed_owner boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; owner_id uuid; ledger text; result jsonb; custom jsonb;
BEGIN
  SELECT user_id INTO STRICT owner_id FROM public.payment_orders WHERE payment_id=p_payment_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||owner_id::text,0));
  SELECT * INTO STRICT o FROM public.payment_orders WHERE payment_id=p_payment_id FOR UPDATE;
  IF p_action NOT IN ('fulfill','refund') OR length(trim(p_note))<5 OR p_note IS NULL THEN RAISE EXCEPTION 'Review note required'; END IF;
  IF o.status='cancelled' OR o.refund_status='succeeded' THEN
    IF p_action='refund' AND EXISTS(SELECT 1 FROM public.payment_review_decisions WHERE payment_id=p_payment_id AND action='refund') THEN
      RETURN jsonb_build_object('status','refunded');
    END IF;
    RAISE EXCEPTION 'Already refunded';
  END IF;
  IF NOT o.legacy_reconciliation THEN
    IF EXISTS(SELECT 1 FROM public.payment_review_decisions WHERE payment_id=p_payment_id AND action=p_action) THEN
      RETURN jsonb_build_object('status',o.status);
    END IF;
    IF p_action<>'refund' OR o.status NOT IN ('pending','completed','superseded') OR NOT o.manual_review_required
      OR o.review_reason IS NULL OR o.review_reason NOT IN ('partial_cancelled','provider_mismatch','provider_state','ledger_conflict')
      THEN RAISE EXCEPTION 'Not an actionable payment review'; END IF;
  END IF;
  IF p_payment->>'id' IS DISTINCT FROM o.payment_id OR p_payment->>'currency' IS DISTINCT FROM 'KRW'
    OR (p_payment#>>'{amount,total}')::bigint IS DISTINCT FROM o.amount THEN RAISE EXCEPTION 'Provider mismatch'; END IF;
  custom:=p_payment->'customData';
  IF (p_payment#>>'{customer,id}' IS NOT NULL AND p_payment#>>'{customer,id}'<>o.user_id::text)
    OR (custom->>'orderId' IS NOT NULL AND custom->>'orderId'<>o.payment_id)
    OR ((NOT p_confirmed_owner OR NOT (o.legacy_reconciliation OR o.legacy_resolution))
      AND (p_payment#>>'{customer,id}' IS NULL OR custom->>'orderId' IS NULL))
    THEN RAISE EXCEPTION 'Owner verification required'; END IF;
  IF p_action='fulfill' AND p_payment->>'status' IS DISTINCT FROM 'PAID' THEN RAISE EXCEPTION 'Not paid'; END IF;
  IF p_action='refund' AND p_payment->>'status' NOT IN ('PAID','PARTIAL_CANCELLED','CANCELLED') THEN RAISE EXCEPTION 'Not refundable'; END IF;
  ledger:=public.payment_order_ledger_state(p_payment_id);
  IF ledger='conflict' AND p_action='fulfill' THEN RAISE EXCEPTION 'Conflicting ledger: investigate before delivery'; END IF;
  INSERT INTO public.payment_review_decisions(payment_id,action,actor_id,note,provider_evidence,ownership_attested)
    VALUES(p_payment_id,p_action,p_actor_id,p_note,p_payment,p_confirmed_owner);
  UPDATE public.payment_orders SET legacy_reconciliation=false,
    legacy_resolution=(o.legacy_resolution OR o.legacy_reconciliation),manual_review_required=false,
    provider_status=p_payment->>'status',provider_checked_at=now(),
    status=CASE WHEN ledger IN ('fulfilled','conflict') THEN 'completed' WHEN p_action='refund' THEN 'superseded' ELSE 'pending' END,
    completed_at=CASE WHEN ledger='fulfilled' THEN coalesce(completed_at,now()) ELSE completed_at END,
    refund_status=CASE WHEN p_action='refund' THEN 'pending' END,
    supersede_reason=CASE WHEN p_action='refund' THEN 'operator_refund' ELSE supersede_reason END,
    reconcile_after=now() WHERE id=o.id;
  IF p_action='fulfill' THEN
    result:=public.complete_payment_order_v2(p_payment_id,o.user_id);
    IF result->>'status' IS DISTINCT FROM 'completed' THEN
      -- An operator chose delivery. A failed grant must not silently turn that
      -- decision into a legacy refund: rollback and leave it for review.
      RAISE EXCEPTION 'Cannot safely fulfill: %',result;
    END IF;
    RETURN result;
  END IF;
  RETURN jsonb_build_object('status','refund_pending');
END; $$;

CREATE OR REPLACE FUNCTION public.observe_legacy_payment(p_payment_id text,p_provider_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE public.payment_orders SET provider_status=p_provider_status,provider_checked_at=now(),
    status=CASE WHEN p_provider_status IN ('NOT_FOUND','READY','FAILED','CANCELLED') THEN 'closed' ELSE status END,
    manual_review_required=p_provider_status NOT IN ('NOT_FOUND','READY','FAILED','CANCELLED')
      OR public.payment_order_ledger_state(p_payment_id)<>'unfulfilled',
    reconcile_after=now()+CASE WHEN p_provider_status IN ('NOT_FOUND','READY','FAILED','CANCELLED') THEN interval '1 day' ELSE interval '6 hours' END
    WHERE payment_id=p_payment_id AND legacy_reconciliation AND status NOT IN ('completed','cancelled');
END; $$;

-- Separate capacity prevents the legacy backlog from delaying new money. All
-- claims are leases; failures remain retryable after five minutes. Completed
-- card orders are also polled daily, so cancellation needs no webhook setup.
CREATE FUNCTION public.claim_payment_reconciliation_v2(p_limit integer DEFAULT 20,p_legacy boolean DEFAULT false)
RETURNS SETOF public.payment_orders LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  UPDATE public.payment_orders SET reconcile_after=now()+interval '5 minutes'
    WHERE id IN (SELECT id FROM public.payment_orders WHERE amount>0 AND reconcile_after<=now()
      AND refund_status IS DISTINCT FROM 'succeeded' AND status<>'cancelled'
      AND CASE WHEN p_legacy THEN legacy_reconciliation AND status IN ('pending','closed')
        ELSE (NOT legacy_reconciliation OR status='completed') AND status IN ('pending','superseded','completed') END
      ORDER BY (refund_status='pending') DESC NULLS LAST,(status='completed'),reconcile_after,payment_id
      FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),100)) RETURNING *;
$$;
CREATE FUNCTION public.defer_payment_reconciliation(p_payment_id text,p_provider_status text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  UPDATE public.payment_orders SET provider_status=p_provider_status,provider_checked_at=now(),
    unpaid_reconcile_checks=CASE WHEN status='superseded' AND p_provider_status IN ('NOT_FOUND','READY','FAILED') THEN unpaid_reconcile_checks+1 ELSE 0 END,
    reconcile_after=now()+CASE WHEN manual_review_required THEN interval '6 hours' WHEN status='completed' THEN interval '1 day'
      WHEN status='superseded' AND p_provider_status IN ('NOT_FOUND','READY','FAILED')
        THEN least(interval '1 day',interval '5 minutes'*power(2,least(unpaid_reconcile_checks+1,9)))
      ELSE interval '5 minutes' END
    WHERE payment_id=p_payment_id AND status NOT IN ('closed','cancelled');
$$;

-- Each class owns capacity; abandoned replacement windows cannot consume the
-- pending-approval or completed-cancellation slots, even during provider errors.
CREATE FUNCTION public.claim_payment_reconciliation_v3(p_limit integer,p_queue text)
RETURNS SETOF public.payment_orders LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  UPDATE public.payment_orders SET reconcile_after=now()+interval '5 minutes'
  WHERE id IN (SELECT id FROM public.payment_orders WHERE amount>0 AND reconcile_after<=now()
    AND refund_status IS DISTINCT FROM 'succeeded' AND status<>'cancelled'
    AND CASE p_queue
      WHEN 'legacy' THEN legacy_reconciliation AND status IN ('pending','closed')
      WHEN 'refund' THEN NOT legacy_reconciliation AND (status='superseded' OR (status='completed' AND refund_status='pending'))
      WHEN 'pending' THEN NOT legacy_reconciliation AND status='pending'
      WHEN 'completed' THEN status='completed' AND refund_status IS DISTINCT FROM 'pending'
      ELSE false END
    ORDER BY reconcile_after,payment_id FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),100)) RETURNING *;
$$;
DROP INDEX public.payment_orders_reconcile;
CREATE INDEX payment_orders_reconcile ON public.payment_orders(legacy_reconciliation,reconcile_after)
  WHERE amount>0 AND status<>'cancelled' AND refund_status IS DISTINCT FROM 'succeeded';

REVOKE ALL ON FUNCTION public.payment_order_ledger_state(text),public.record_payment_cancellation(text,text),
  public.record_payment_partial_cancellation(text),public.record_payment_review(text,text,text),
  public.hide_purchase(uuid,uuid),public.close_payment_review(text,uuid,text,jsonb,boolean),public.claim_payment_reconciliation_v3(integer,text),
  public.resolve_legacy_payment(text,text,uuid,text,jsonb,boolean),
  public.claim_payment_reconciliation_v2(integer,boolean),public.defer_payment_reconciliation(text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_order_ledger_state(text),public.record_payment_cancellation(text,text),
  public.record_payment_partial_cancellation(text),public.record_payment_review(text,text,text),
  public.hide_purchase(uuid,uuid),public.close_payment_review(text,uuid,text,jsonb,boolean),public.claim_payment_reconciliation_v3(integer,text),
  public.resolve_legacy_payment(text,text,uuid,text,jsonb,boolean),
  public.claim_payment_reconciliation_v2(integer,boolean),public.defer_payment_reconciliation(text,text)
  TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
