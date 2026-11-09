-- Application prerequisite. File only: do not run against production during repair.
BEGIN;

-- The reviewed backlog is an explicit, sealed manifest, never all rows present
-- at migration time. Orders opened during rollout retain normal completion.
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.payment_transition WHERE id AND snapshot_sealed)
    THEN RAISE EXCEPTION 'Seal the reviewed legacy snapshot first'; END IF;
END; $$;

ALTER TABLE public.payment_orders DROP CONSTRAINT payment_orders_status_check;
ALTER TABLE public.payment_orders ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN ('pending','completed','superseded','closed'));
ALTER TABLE public.payment_orders
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN superseded_by text,
  ADD COLUMN supersede_reason text,
  ADD COLUMN refund_status text CHECK (refund_status IN ('pending','succeeded')),
  ADD COLUMN refunded_at timestamptz,
  ADD COLUMN refund_cancellation_id text,
  ADD COLUMN create_request_id uuid,
  ADD COLUMN reconcile_after timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  ADD COLUMN legacy_reconciliation boolean NOT NULL DEFAULT false,
  ADD COLUMN provider_status text,
  ADD COLUMN provider_checked_at timestamptz,
  ADD COLUMN review_reason text,
  ADD COLUMN manual_review_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.payment_orders ALTER COLUMN legacy_reconciliation SET DEFAULT false;
UPDATE public.payment_orders o SET legacy_reconciliation=true
  FROM public.payment_legacy_snapshot s WHERE s.payment_id=o.payment_id AND o.status='pending';
CREATE UNIQUE INDEX purchased_private_db_once ON public.purchased_items(user_id,item_id)
  WHERE item_type='PRIVATE_DB';
CREATE INDEX payment_orders_reconcile ON public.payment_orders(reconcile_after)
  WHERE status IN ('pending','superseded','closed') AND amount>0;
CREATE UNIQUE INDEX payment_orders_create_request ON public.payment_orders(user_id,create_request_id)
  WHERE create_request_id IS NOT NULL;
CREATE TABLE public.payment_refund_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payment_id text NOT NULL REFERENCES public.payment_orders(payment_id),
  amount bigint NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('pending','succeeded')),
  error_code text,
  cancellation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_refund_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_refund_attempts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.payment_refund_attempts TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.payment_refund_attempts_id_seq TO service_role;

-- Closed until resolution + scheduler installation and an actual successful
-- scheduled HTTP round trip. Partial installation cannot open card checkout.
CREATE FUNCTION public.payment_checkout_ready() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT false $$;
REVOKE ALL ON FUNCTION public.payment_checkout_ready() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.payment_checkout_ready() TO service_role;

-- Preserve the deployed server's INSERT until the separate cutover migration.
-- Both creation contracts serialize with completion and recheck one-time goods.
CREATE FUNCTION public.check_private_db_order() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||NEW.user_id::text,0));
  IF EXISTS(SELECT 1 FROM public.payment_orders existing WHERE existing.user_id=NEW.user_id
    AND existing.manual_review_required
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(existing.items) x,jsonb_array_elements(NEW.items) y
      WHERE x->>'item_id'=y->>'item_id')) THEN RAISE EXCEPTION 'Payment requires review'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.items) i JOIN public.purchased_items p
    ON p.user_id=NEW.user_id AND p.item_type='PRIVATE_DB' AND p.item_id=i->>'item_id'
    WHERE i->>'item_type'='PRIVATE_DB') THEN RAISE EXCEPTION 'Private DB already purchased'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER check_private_db_order BEFORE INSERT ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.check_private_db_order();

-- Serialize create/complete/replacement per member. Only explicitly selected
-- orders can be replaced; all other pending rows remain independently tracked.
CREATE FUNCTION public.create_payment_order(p_payment_id text,p_user_id uuid,p_quote jsonb,
  p_previous_payment_ids text[],p_replace_open boolean,p_request_id uuid,
  p_snapshot_id text,p_snapshot_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; current_ids text[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||p_user_id::text,0));
  IF p_quote->>'kind'<>'cart' THEN RAISE EXCEPTION 'Invalid order kind'; END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Missing create request id'; END IF;
  SELECT * INTO o FROM public.payment_orders WHERE user_id=p_user_id AND create_request_id=p_request_id;
  IF FOUND THEN RETURN jsonb_build_object('recoverPaymentId',o.payment_id); END IF;
  -- Only card creation or retiring an approvable card needs the recovery worker.
  -- Independent zero-card orders retain the same lock, replay and ledger checks.
  IF (p_quote->>'amount')::bigint IS DISTINCT FROM 0 AND NOT public.payment_checkout_ready()
    THEN RAISE EXCEPTION 'Payment checkout not ready'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_quote->'items') i JOIN public.purchased_items p
    ON p.user_id=p_user_id AND p.item_type='PRIVATE_DB' AND p.item_id=i->>'item_id'
    WHERE i->>'item_type'='PRIVATE_DB') THEN
    RETURN jsonb_build_object('alreadyPurchased',true);
  END IF;
  SELECT * INTO o FROM public.payment_orders existing WHERE user_id=p_user_id
    AND (manual_review_required OR (legacy_reconciliation AND status='pending'))
    AND EXISTS(SELECT 1 FROM jsonb_array_elements(existing.items) x,jsonb_array_elements(p_quote->'items') y
      WHERE x->>'item_id'=y->>'item_id') ORDER BY payment_id LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('reviewRequired',true,'reviewPaymentId',o.payment_id); END IF;
  SELECT * INTO o FROM public.payment_orders WHERE user_id=p_user_id AND kind='cart'
    ORDER BY created_at DESC,payment_id DESC LIMIT 1;
  IF o.payment_id IS DISTINCT FROM p_snapshot_id OR o.status IS DISTINCT FROM p_snapshot_status THEN
    RETURN jsonb_build_object('recoverPaymentId',o.payment_id,'retry',true);
  END IF;
  -- A delayed duplicate request must recover the winner, never create again.
  SELECT * INTO o FROM public.payment_orders WHERE user_id=p_user_id
    AND payment_id=ANY(p_previous_payment_ids) AND status='completed' LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('recoverPaymentId',o.payment_id); END IF;
  SELECT * INTO o FROM public.payment_orders WHERE user_id=p_user_id
    AND payment_id=ANY(p_previous_payment_ids) AND superseded_by IS NOT NULL LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('recoverPaymentId',o.superseded_by); END IF;
  SELECT array_agg(payment_id ORDER BY payment_id) INTO current_ids
    FROM public.payment_orders WHERE user_id=p_user_id AND kind='cart' AND status='pending'
      AND payment_id=ANY(p_previous_payment_ids) AND NOT legacy_reconciliation AND NOT manual_review_required;
  IF NOT p_replace_open AND EXISTS(SELECT 1 FROM public.payment_orders
    WHERE payment_id=ANY(current_ids) AND amount>0) THEN
    RETURN jsonb_build_object('recoverPaymentId',current_ids[1],'choiceRequired',true);
  END IF;
  IF EXISTS(SELECT 1 FROM public.payment_orders WHERE payment_id=ANY(current_ids) AND amount>0)
    AND NOT public.payment_checkout_ready() THEN RAISE EXCEPTION 'Payment checkout not ready'; END IF;
  IF (p_quote->>'used_points')::bigint>coalesce((SELECT earned_points FROM public.profiles WHERE id=p_user_id),0) THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;
  UPDATE public.payment_orders SET status='superseded',superseded_at=now(),
    superseded_by=p_payment_id,supersede_reason='replaced',
    refund_status=CASE WHEN amount>0 THEN 'pending' END,reconcile_after=now()
    WHERE user_id=p_user_id AND payment_id=ANY(current_ids) AND status='pending';
  INSERT INTO public.payment_orders(payment_id,user_id,kind,amount,total,used_points,points,items,name,create_request_id)
    VALUES(p_payment_id,p_user_id,p_quote->>'kind',(p_quote->>'amount')::bigint,
      (p_quote->>'total')::bigint,(p_quote->>'used_points')::bigint,0,p_quote->'items',p_quote->>'name',p_request_id);
  RETURN jsonb_build_object('paymentId',p_payment_id);
END; $$;

CREATE FUNCTION public.supersede_payment_order(p_payment_id text,p_user_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||p_user_id::text,0));
  SELECT * INTO o FROM public.payment_orders WHERE payment_id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR o.user_id<>p_user_id THEN RAISE EXCEPTION 'Order owner mismatch'; END IF;
  IF o.status='completed' THEN RETURN jsonb_build_object('alreadyProcessed',true); END IF;
  IF o.status<>'pending' THEN RETURN jsonb_build_object('superseded',true); END IF;
  IF o.manual_review_required THEN RAISE EXCEPTION 'Payment requires review'; END IF;
  -- Never move a pre-rollout card payment into automatic compensation.
  IF o.legacy_reconciliation AND o.amount>0 THEN RAISE EXCEPTION 'Legacy payment requires review'; END IF;
  UPDATE public.payment_orders SET status='superseded',superseded_at=coalesce(superseded_at,now()),
    supersede_reason=coalesce(supersede_reason,p_reason),
    refund_status=CASE WHEN amount>0 THEN coalesce(refund_status,'pending') END,reconcile_after=now()
    WHERE id=o.id;
  RETURN jsonb_build_object('superseded',true);
END; $$;

CREATE OR REPLACE FUNCTION public.complete_payment_order_v2(p_payment_id text,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; item jsonb; item_total bigint; failure text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||p_user_id::text,0));
  SELECT * INTO o FROM public.payment_orders WHERE payment_id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR o.user_id<>p_user_id THEN RAISE EXCEPTION 'Order owner mismatch'; END IF;
  IF o.status='completed' THEN RETURN jsonb_build_object('status','completed','alreadyProcessed',true); END IF;
  IF o.status='cancelled' THEN RETURN jsonb_build_object('status','cancelled'); END IF;
  IF o.manual_review_required THEN RETURN jsonb_build_object('status','review_required','reviewRequired',true); END IF;
  IF o.legacy_reconciliation AND o.amount>0 THEN RETURN jsonb_build_object('status','review_required','reviewRequired',true); END IF;
  IF o.status<>'pending' THEN RETURN jsonb_build_object('status','superseded','superseded',true); END IF;
  -- Pre-existing inconsistent ledgers are not evidence that fulfillment rolled
  -- back. Do not refund an order that may already have delivered its goods.
  IF EXISTS(SELECT 1 FROM public.payment_history WHERE payment_id=p_payment_id)
    OR EXISTS(SELECT 1 FROM public.purchased_items WHERE payment_id=p_payment_id)
    OR EXISTS(SELECT 1 FROM public.point_transactions WHERE related_id=o.id AND type='purchase') THEN
    UPDATE public.payment_orders SET manual_review_required=true,review_reason='ledger_conflict',
      reconcile_after=now()+interval '6 hours' WHERE id=o.id;
    RETURN jsonb_build_object('status','review_required','reviewRequired',true);
  END IF;
  -- All fulfillment writes are a subtransaction. Any failure rolls back points,
  -- history AND grants before irreversibly scheduling the card compensation.
  BEGIN
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) i JOIN public.purchased_items p
      ON p.user_id=p_user_id AND p.item_type='PRIVATE_DB' AND p.item_id=i->>'item_id'
      WHERE i->>'item_type'='PRIVATE_DB') THEN
      RAISE EXCEPTION 'Private DB already purchased' USING ERRCODE='P0003';
    END IF;
    -- A second in-flight order for overlapping goods cannot spend points or
    -- grant again. A new intentional repeat purchase AFTER completion is valid.
    IF EXISTS(SELECT 1 FROM public.payment_orders other
      WHERE other.user_id=p_user_id AND other.status='completed' AND other.payment_id<>p_payment_id
        AND other.completed_at>=o.created_at
        AND EXISTS(SELECT 1 FROM jsonb_array_elements(other.items) x,jsonb_array_elements(o.items) y
          WHERE x->>'item_id'=y->>'item_id')) THEN
      RAISE EXCEPTION 'Concurrent duplicate purchase' USING ERRCODE='P0003';
    END IF;
    SELECT sum((value->>'price')::bigint) INTO item_total FROM jsonb_array_elements(o.items);
    IF item_total IS DISTINCT FROM o.total OR EXISTS(SELECT 1 FROM jsonb_array_elements(o.items)
      WHERE (value->>'price')::bigint<0) THEN RAISE EXCEPTION 'Invalid order total'; END IF;
    UPDATE public.profiles SET earned_points=coalesce(earned_points,0)-o.used_points
      WHERE id=p_user_id AND coalesce(earned_points,0)>=o.used_points;
    IF NOT FOUND AND o.used_points>0 THEN RAISE EXCEPTION 'Insufficient points or missing profile' USING ERRCODE='P0002'; END IF;
    INSERT INTO public.payment_history(user_id,payment_id,merchant_uid,amount,points_added,status)
      VALUES(p_user_id,p_payment_id,p_payment_id,o.amount,0,'PAID');
    IF o.used_points>0 THEN
      INSERT INTO public.point_transactions(user_id,type,amount,description,related_id)
        VALUES(p_user_id,'purchase',-o.used_points,o.name,o.id);
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(o.items) LOOP
      INSERT INTO public.purchased_items(user_id,payment_id,item_type,item_id,title,price_paid)
        VALUES(p_user_id,p_payment_id,item->>'item_type',item->>'item_id',item->>'title',(item->>'price')::bigint);
    END LOOP;
    UPDATE public.payment_orders SET status='completed',completed_at=now() WHERE id=o.id;
    RETURN jsonb_build_object('status','completed','alreadyProcessed',false);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS failure=RETURNED_SQLSTATE;
  END;
  UPDATE public.payment_orders SET status='superseded',superseded_at=now(),
    supersede_reason=CASE WHEN failure='P0002' THEN 'insufficient_points' WHEN failure='P0003' THEN 'concurrent_duplicate' ELSE 'fulfillment_failed:'||failure END,
    refund_status=CASE WHEN amount>0 THEN 'pending' END,reconcile_after=now() WHERE id=o.id;
  RETURN jsonb_build_object('status','superseded','superseded',true,'refundRequired',o.amount>0);
END; $$;

-- Old servers assume every non-error result means goods were delivered.
-- Keep that contract even during rollout or application rollback. Raising also
-- rolls back a failed fulfillment attempt; only v2 persists compensation state.
CREATE OR REPLACE FUNCTION public.complete_payment_order(p_payment_id text,p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  result := public.complete_payment_order_v2(p_payment_id,p_user_id);
  IF result->>'status' IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Payment not fulfilled: %',result->>'status';
  END IF;
  RETURN result;
END; $$;

CREATE FUNCTION public.record_payment_refund(p_payment_id text,p_outcome text,
  p_error_code text DEFAULT NULL,p_cancellation_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.payment_orders WHERE payment_id=p_payment_id FOR UPDATE;
  IF NOT FOUND OR (o.status<>'superseded' AND NOT (o.status='completed' AND o.supersede_reason='operator_refund'))
    OR o.amount<=0 OR o.legacy_reconciliation THEN RAISE EXCEPTION 'Not refundable'; END IF;
  IF o.refund_status='succeeded' THEN RETURN; END IF;
  INSERT INTO public.payment_refund_attempts(payment_id,amount,outcome,error_code,cancellation_id)
    VALUES(p_payment_id,o.amount,p_outcome,p_error_code,p_cancellation_id);
  UPDATE public.payment_orders SET refund_status=p_outcome,
    manual_review_required=CASE WHEN p_outcome='pending' THEN true WHEN review_reason='refund_pending' THEN false ELSE manual_review_required END,
    review_reason=CASE WHEN p_outcome='pending' THEN 'refund_pending' ELSE review_reason END,
    refunded_at=CASE WHEN p_outcome='succeeded' THEN now() END,
    refund_cancellation_id=p_cancellation_id,reconcile_after=now()+interval '5 minutes' WHERE id=o.id;
END; $$;

-- Record old orders without creating refunds, fulfillment, or point writes.
-- Closed legacy rows remain observable so a delayed approval is reported too.
CREATE FUNCTION public.observe_legacy_payment(p_payment_id text,p_provider_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  UPDATE public.payment_orders SET provider_status=p_provider_status,provider_checked_at=now(),
    status=CASE WHEN p_provider_status IN ('NOT_FOUND','READY','FAILED','CANCELLED') THEN 'closed' ELSE status END,
    manual_review_required=p_provider_status NOT IN ('NOT_FOUND','READY','FAILED','CANCELLED'),
    reconcile_after=now()+interval '1 hour'
    WHERE payment_id=p_payment_id AND legacy_reconciliation AND status<>'completed';
END; $$;

CREATE FUNCTION public.claim_payment_reconciliation(p_limit integer DEFAULT 5)
RETURNS SETOF public.payment_orders LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  UPDATE public.payment_orders SET reconcile_after=now()+interval '5 minutes'
    WHERE id IN (SELECT id FROM public.payment_orders WHERE (status IN ('pending','superseded') OR (status='closed' AND legacy_reconciliation))
      AND amount>0 AND refund_status IS DISTINCT FROM 'succeeded' AND reconcile_after<=now()
      ORDER BY reconcile_after FOR UPDATE SKIP LOCKED LIMIT least(greatest(p_limit,1),10)) RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.create_payment_order(text,uuid,jsonb,text[],boolean,uuid,text,text),
  public.supersede_payment_order(text,uuid,text),public.complete_payment_order(text,uuid),public.complete_payment_order_v2(text,uuid),
  public.record_payment_refund(text,text,text,text),public.claim_payment_reconciliation(integer),public.observe_legacy_payment(text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_order(text,uuid,jsonb,text[],boolean,uuid,text,text),
  public.supersede_payment_order(text,uuid,text),public.complete_payment_order(text,uuid),public.complete_payment_order_v2(text,uuid),
  public.record_payment_refund(text,text,text,text),public.claim_payment_reconciliation(integer),public.observe_legacy_payment(text,text)
  TO service_role;
COMMIT;
