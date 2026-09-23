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
