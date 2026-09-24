-- Retire seller payouts without deleting balances, orders, or historical ledgers.
-- Apply together with the application release that removes payout entry points.
BEGIN;

CREATE OR REPLACE FUNCTION public.complete_payment_order(p_payment_id text, p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  o public.payment_orders%ROWTYPE;
  item jsonb;
  item_total bigint;
BEGIN
  SELECT * INTO o FROM public.payment_orders WHERE payment_id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR o.user_id<>p_user_id THEN RAISE EXCEPTION 'Order owner mismatch'; END IF;
  IF o.status='completed' THEN RETURN jsonb_build_object('alreadyProcessed',true); END IF;
  IF EXISTS(SELECT 1 FROM public.payment_history WHERE payment_id=p_payment_id) THEN
    RAISE EXCEPTION 'Unreconciled payment history';
  END IF;
  SELECT sum((value->>'price')::bigint) INTO item_total FROM jsonb_array_elements(o.items);
  IF item_total IS DISTINCT FROM o.total OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(o.items) WHERE (value->>'price')::bigint<0
  ) THEN RAISE EXCEPTION 'Invalid order total'; END IF;

  -- Previously queued orders may still contain reward_user_id. Ignore it.
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
  END LOOP;
  UPDATE public.payment_orders SET status='completed',completed_at=now() WHERE id=o.id;
  RETURN jsonb_build_object('alreadyProcessed',false);
END; $$;
REVOKE ALL ON FUNCTION public.complete_payment_order(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_payment_order(text,uuid) TO service_role;

-- Old direct-purchase and withdrawal RPCs are disabled. Historical orders,
-- point balances, and ledgers remain available to the operator for accounting.
DO $$
DECLARE routine regprocedure;
BEGIN
  FOR routine IN SELECT oid::regprocedure FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname IN ('purchase_exam_material','request_settlement','process_settlement') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',routine);
  END LOOP;
END $$;

-- Keep historical rows for accounting, but remove retired client access.
-- Some fresh environments never had the original settlement table.
DO $$
BEGIN
  IF to_regclass('public.submission_earnings') IS NOT NULL THEN
    REVOKE ALL ON public.submission_earnings FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regclass('public.settlement_requests') IS NOT NULL THEN
    REVOKE ALL ON public.settlement_requests FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

COMMIT;
