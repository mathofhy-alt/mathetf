-- REVIEWED PRODUCTION PREDEPLOY BUNDLE. Apply only to the existing live Supabase project.
-- Additive schema first; deploy the new app only after verification below succeeds.
-- A failed statement rolls this whole transaction back.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
-- Source: 202609200001_question_scope.sql
-- Use body parameters for all selected papers and exclusion IDs (no URL truncation).
CREATE OR REPLACE FUNCTION public.question_bank_candidates(p_scope jsonb,p_excluded uuid[] DEFAULT '{}')
RETURNS SETOF public.questions LANGUAGE sql STABLE SECURITY INVOKER
SET search_path=public,pg_temp AS $$
 WITH rules AS MATERIALIZED (
  SELECT * FROM jsonb_to_recordset(p_scope) AS r(sources text[],school text,grade text,year text,semesters text[],"semesterPrefix" text,subjects text[])
 ), eligible AS (
  SELECT q.id FROM public.questions q JOIN rules r ON q.source_db_id=ANY(r.sources) AND (r.grade IS NULL OR q.grade::text=r.grade)
  UNION
  SELECT q.id FROM public.questions q JOIN rules r ON q.school=r.school
  WHERE r.sources IS NULL AND (r.grade IS NULL OR q.grade::text=r.grade)
    AND (r.year IS NULL OR q.year::text=r.year)
    AND (r.semesters IS NULL OR q.semester=ANY(r.semesters))
    AND (r."semesterPrefix" IS NULL OR starts_with(q.semester,r."semesterPrefix"))
    AND (r.subjects IS NULL OR q.subject=ANY(r.subjects))
 )
 SELECT q.* FROM public.questions q JOIN eligible e ON q.id=e.id
 WHERE q.work_status='sorted' AND NOT(q.id=ANY(p_excluded));
$$;
REVOKE ALL ON FUNCTION public.question_bank_candidates(jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_candidates(jsonb,uuid[]) TO service_role;


-- Scalar JSON aggregates avoid PostgREST's row cap and repeated scans of the same full scope.
CREATE FUNCTION public.question_bank_facets(p_scope jsonb,p_include_off boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH pool AS MATERIALIZED (SELECT * FROM public.question_bank_candidates(p_scope) WHERE p_include_off OR is_off_curriculum=false),
 grouped AS (
  SELECT subject,unit,is_off_curriculum,coalesce(array_agg(DISTINCT concept) FILTER(WHERE concept IS NOT NULL),'{}') AS key_concepts
  FROM pool LEFT JOIN LATERAL unnest(key_concepts) concept ON true GROUP BY subject,unit,is_off_curriculum
 ) SELECT coalesce(jsonb_agg(to_jsonb(grouped)),'[]') FROM grouped;
$$;
CREATE FUNCTION public.question_bank_random(p_scope jsonb,p_excluded uuid[],p_subject text,p_units text[],p_min integer,p_max integer,p_count integer,p_include_off boolean)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH pool AS MATERIALIZED (
  SELECT id,question_number,subject,grade,school,year,semester,difficulty,key_concepts,unit,work_status,source_db_id,question_type,is_off_curriculum
  FROM public.question_bank_candidates(p_scope,p_excluded)
  WHERE (p_include_off OR is_off_curriculum=false) AND (p_subject='' OR subject=p_subject)
   AND (cardinality(p_units)=0 OR unit=ANY(p_units))
   AND difficulty::text IN (SELECT generate_series(greatest(1,p_min),least(10,p_max))::text)
 ), chosen AS (SELECT * FROM pool ORDER BY random() LIMIT greatest(0,least(50,p_count)))
 SELECT jsonb_build_object('questions',coalesce((SELECT jsonb_agg(to_jsonb(chosen)) FROM chosen),'[]'),'availableCount',(SELECT count(*) FROM pool));
$$;
REVOKE ALL ON FUNCTION public.question_bank_facets(jsonb,boolean), public.question_bank_random(jsonb,uuid[],text,text[],integer,integer,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_facets(jsonb,boolean), public.question_bank_random(jsonb,uuid[],text,text[],integer,integer,integer,boolean) TO service_role;

-- Source: 202609200002_payment_orders.sql
-- Apply only to a reviewed test/staging database first. No legacy history is rewritten.
-- The live schema has no submission_earnings table. Create it before the
-- payment completion function records a submitter's share of a sale.
CREATE TABLE public.submission_earnings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 submission_id uuid NOT NULL REFERENCES public.exam_materials(id),
 db_item_id uuid NOT NULL REFERENCES public.exam_materials(id),
 purchase_id text NOT NULL,
 buyer_id uuid NOT NULL REFERENCES auth.users(id),
 submitter_id uuid NOT NULL REFERENCES auth.users(id),
 sale_amount bigint NOT NULL CHECK (sale_amount >= 0),
 earnings_amount bigint NOT NULL CHECK (earnings_amount >= 0 AND earnings_amount <= sale_amount),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (purchase_id, db_item_id)
);
ALTER TABLE public.submission_earnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own submission earnings" ON public.submission_earnings
 FOR SELECT TO authenticated USING (submitter_id = auth.uid());
REVOKE ALL ON public.submission_earnings FROM anon, authenticated;
GRANT SELECT ON public.submission_earnings TO authenticated;
GRANT ALL ON public.submission_earnings TO service_role;
CREATE INDEX submission_earnings_submitter_created ON public.submission_earnings(submitter_id, created_at DESC);

CREATE TABLE public.payment_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id text UNIQUE NOT NULL,
 user_id uuid NOT NULL REFERENCES auth.users(id), kind text NOT NULL CHECK(kind = 'cart'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
 amount bigint NOT NULL CHECK(amount >= 0), total bigint NOT NULL CHECK(total >= 0),
 used_points bigint NOT NULL DEFAULT 0 CHECK(used_points >= 0), points bigint NOT NULL DEFAULT 0 CHECK(points = 0),
 items jsonb NOT NULL DEFAULT '[]', name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 CHECK(amount = total - used_points), CHECK(jsonb_typeof(items) = 'array'),
 CHECK(jsonb_array_length(items) BETWEEN 1 AND 100)
);
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own orders" ON public.payment_orders FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON public.payment_orders FROM anon, authenticated;
GRANT SELECT ON public.payment_orders TO authenticated;
GRANT ALL ON public.payment_orders TO service_role;
CREATE INDEX payment_orders_user_created ON public.payment_orders(user_id,created_at DESC);
-- Existing duplicates, if any, do not block the new order namespace.
CREATE UNIQUE INDEX payment_history_server_order_unique ON public.payment_history(payment_id) WHERE payment_id LIKE 'order-%';
CREATE UNIQUE INDEX purchased_items_server_order_unique ON public.purchased_items(payment_id,item_id) WHERE payment_id LIKE 'order-%';
REVOKE INSERT, UPDATE, DELETE ON public.purchased_items, public.payment_history FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.complete_payment_order(p_payment_id text, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; item jsonb; reward bigint; recipient uuid; item_total bigint;
BEGIN
 SELECT * INTO o FROM public.payment_orders WHERE payment_id=p_payment_id FOR UPDATE;
 IF NOT FOUND OR o.user_id<>p_user_id THEN RAISE EXCEPTION 'Order owner mismatch'; END IF;
 IF o.status='completed' THEN RETURN jsonb_build_object('alreadyProcessed',true); END IF;
 IF EXISTS(SELECT 1 FROM public.payment_history WHERE payment_id=p_payment_id) THEN RAISE EXCEPTION 'Unreconciled payment history'; END IF;
 SELECT sum((value->>'price')::bigint) INTO item_total FROM jsonb_array_elements(o.items);
 IF item_total IS DISTINCT FROM o.total OR EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) WHERE (value->>'price')::bigint<0)
   THEN RAISE EXCEPTION 'Invalid order total'; END IF;
 -- Lock all affected balances in deterministic order to prevent lost updates and reciprocal-sale deadlocks.
 PERFORM id FROM public.profiles WHERE id=p_user_id OR id IN
   (SELECT (value->>'reward_user_id')::uuid FROM jsonb_array_elements(o.items) WHERE value->>'reward_user_id' IS NOT NULL)
   ORDER BY id FOR UPDATE;
 UPDATE public.profiles SET earned_points=coalesce(earned_points,0)-o.used_points
   WHERE id=p_user_id AND coalesce(earned_points,0)>=o.used_points;
 IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient points or missing profile'; END IF;
 INSERT INTO public.payment_history(user_id,payment_id,merchant_uid,amount,points_added,status)
 VALUES(p_user_id,p_payment_id,p_payment_id,o.amount,o.points,'PAID');
 IF o.used_points>0 THEN
   INSERT INTO public.point_transactions(user_id,type,amount,description,related_id)
   VALUES(p_user_id,'purchase',-o.used_points,o.name,o.id);
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(o.items) LOOP
   INSERT INTO public.purchased_items(user_id,payment_id,item_type,item_id,title,price_paid)
   VALUES(p_user_id,p_payment_id,item->>'item_type',item->>'item_id',item->>'title',(item->>'price')::bigint);
   recipient := (item->>'reward_user_id')::uuid;
   reward := floor((item->>'price')::numeric * 0.7)::bigint;
   IF recipient IS NOT NULL AND recipient<>p_user_id AND reward>0 THEN
     UPDATE public.profiles SET earned_points=coalesce(earned_points,0)+reward WHERE id=recipient;
     IF NOT FOUND THEN RAISE EXCEPTION 'Reward recipient profile missing'; END IF;
     INSERT INTO public.submission_earnings(submission_id,db_item_id,purchase_id,buyer_id,submitter_id,sale_amount,earnings_amount)
     VALUES((item->>'submission_id')::uuid,(item->>'item_id')::uuid,p_payment_id,p_user_id,recipient,(item->>'price')::bigint,reward);
     INSERT INTO public.point_transactions(user_id,type,amount,description,related_id)
     VALUES(recipient,'sale',reward,item->>'title',o.id);
   END IF;
 END LOOP;
 UPDATE public.payment_orders SET status='completed',completed_at=now() WHERE id=o.id;
 RETURN jsonb_build_object('alreadyProcessed',false);
END; $$;
REVOKE ALL ON FUNCTION public.complete_payment_order(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_order(text,uuid) TO service_role;

-- The old credit RPC is no longer called by the app. Do not leave a direct client crediting path.
DO $$ DECLARE routine record; BEGIN
 FOR routine IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='increment_points' LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',routine.signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',routine.signature);
 END LOOP;
END $$;

-- Source: 202609200003_question_bank_events.sql
CREATE TABLE public.question_bank_events (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site text NOT NULL DEFAULT 'mathetf' CHECK(site='mathetf'),
 event text NOT NULL CHECK(event IN ('qb_enter','qb_db_select','qb_search','qb_search_empty','qb_cart_add','qb_save_fail','qb_save','qb_file_response')),
 source text NOT NULL CHECK(source IN ('client','server')), session_id uuid, user_id uuid, exam_id uuid,
 question_count integer, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source='server' OR event NOT IN ('qb_save','qb_file_response'))
);
ALTER TABLE public.question_bank_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_bank_events FROM anon,authenticated;
GRANT ALL ON public.question_bank_events TO service_role;
CREATE INDEX qb_events_time ON public.question_bank_events(created_at);
CREATE UNIQUE INDEX qb_save_once ON public.question_bank_events(exam_id) WHERE event='qb_save';
-- The saved item and its authoritative success event commit together.
CREATE FUNCTION public.save_exam_item(p_user_id uuid, p_folder_id uuid, p_name text, p_reference_id uuid, p_details jsonb, p_session_id uuid, p_track boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.user_items%ROWTYPE;
BEGIN
 IF p_folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.folders WHERE id=p_folder_id AND user_id=p_user_id) THEN
   RAISE EXCEPTION 'Invalid folder';
 END IF;
 PERFORM id FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF (SELECT count(*) FROM public.user_items WHERE user_id=p_user_id AND type='saved_exam') >= 20 THEN RAISE EXCEPTION 'Exam limit reached'; END IF;
 INSERT INTO public.user_items(user_id,folder_id,type,name,reference_id,details)
 VALUES(p_user_id,p_folder_id,'saved_exam',p_name,p_reference_id,p_details) RETURNING * INTO result;
 IF p_track THEN
   INSERT INTO public.question_bank_events(event,event_id,source,session_id,user_id,exam_id,question_count)
   VALUES('qb_save',gen_random_uuid(),'server',p_session_id,p_user_id,result.id,(p_details->>'question_count')::integer);
 END IF;
 RETURN to_jsonb(result);
END; $$;
REVOKE ALL ON FUNCTION public.save_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean) TO service_role;

CREATE FUNCTION public.question_bank_metrics(p_days integer DEFAULT 28)
RETURNS TABLE(event text,source text,events bigint,sessions bigint,users bigint,exams bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT event,source,count(*),count(DISTINCT session_id),count(DISTINCT user_id),count(DISTINCT exam_id)
 FROM public.question_bank_events WHERE site='mathetf' AND created_at>=now()-make_interval(days=>greatest(1,least(p_days,90)))
 GROUP BY event,source;
$$;
REVOKE ALL ON FUNCTION public.question_bank_metrics(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_metrics(integer) TO service_role;

-- Source: 202609200004_growth_metrics.sql
-- Apply only in the isolated test database before deployment.
ALTER TABLE public.question_bank_events DROP CONSTRAINT question_bank_events_event_check;
ALTER TABLE public.question_bank_events ADD CONSTRAINT question_bank_events_event_check CHECK(event IN ('qb_enter','qb_db_select','qb_search','qb_search_empty','qb_cart_add','qb_save_fail','qb_save','qb_file_response','qb_demo','qb_auto_generate','qb_auth_request','qb_resume','qb_clone'));
ALTER TABLE public.question_bank_events ADD COLUMN origin text, ADD COLUMN campaign text, ADD COLUMN device text;
CREATE FUNCTION public.question_bank_growth(p_days integer DEFAULT 28) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH e AS (SELECT * FROM public.question_bank_events WHERE site='mathetf'),
 recent AS (SELECT * FROM e WHERE created_at>=now()-make_interval(days=>greatest(7,least(p_days,90)))),
 first_save AS (SELECT user_id,min(created_at) AS first_at FROM e WHERE event='qb_save' AND user_id IS NOT NULL GROUP BY user_id),
 first_file AS (SELECT user_id,min(created_at) AS first_at FROM e WHERE event='qb_file_response' AND user_id IS NOT NULL GROUP BY user_id),
 mature AS (SELECT * FROM first_save WHERE first_at>=now()-make_interval(days=>greatest(7,least(p_days,90))) AND first_at<=now()-interval '7 days'),
 cohort AS (SELECT m.*,EXISTS(SELECT 1 FROM e WHERE e.user_id=m.user_id AND event='qb_save' AND created_at>m.first_at AND created_at<=m.first_at+interval '7 days') AS returned FROM mature m),
 attribution AS (SELECT DISTINCT ON(session_id) session_id,campaign,origin FROM e WHERE session_id IS NOT NULL AND source='client' ORDER BY session_id,created_at),
 channels AS (SELECT coalesce(a.campaign,a.origin,'direct') AS channel,count(DISTINCT r.session_id) FILTER(WHERE r.event='qb_enter') AS starts,count(DISTINCT r.user_id) FILTER(WHERE r.event='qb_save') AS savers,count(DISTINCT r.user_id) FILTER(WHERE r.event='qb_file_response') AS file_users,count(DISTINCT r.user_id) FILTER(WHERE r.event='qb_file_response' AND r.created_at=ff.first_at) AS first_file_users FROM recent r LEFT JOIN attribution a USING(session_id) LEFT JOIN first_file ff ON ff.user_id=r.user_id GROUP BY 1)
 SELECT jsonb_build_object('days',greatest(7,least(p_days,90)),'site','mathetf.com','measuredSince',(SELECT min(created_at) FROM e),'starts',(SELECT count(DISTINCT session_id) FROM recent WHERE event='qb_enter'),'savedUsers',(SELECT count(DISTINCT user_id) FROM recent WHERE event='qb_save'),'firstFileUsers',(SELECT count(*) FROM first_file WHERE first_at>=now()-make_interval(days=>greatest(7,least(p_days,90)))),'fileUsers',(SELECT count(DISTINCT user_id) FROM recent WHERE event='qb_file_response'),'firstSavedUsers',(SELECT count(*) FROM first_save WHERE first_at>=now()-make_interval(days=>greatest(7,least(p_days,90)))),'matureUsers',(SELECT count(*) FROM cohort),'returnedUsers',(SELECT count(*) FROM cohort WHERE returned),'emptySearches',(SELECT count(*) FROM recent WHERE event='qb_search_empty'),'saveFailures',(SELECT count(*) FROM recent WHERE event='qb_save_fail'),'channels',coalesce((SELECT jsonb_agg(channels) FROM channels),'[]'::jsonb));
 $$;
REVOKE ALL ON FUNCTION public.question_bank_growth(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_growth(integer) TO service_role;

COMMIT;
SELECT to_regclass('public.payment_orders') AS payment_orders,
       to_regclass('public.submission_earnings') AS submission_earnings,
       to_regclass('public.question_bank_events') AS question_bank_events,
       to_regprocedure('public.complete_payment_order(text,uuid)') AS complete_payment_order;