-- Preparation only; preserves all deployed order APIs and their permissions.
-- Apply before payment_supersede. Supply the reviewed backlog IDs explicitly.
BEGIN;
CREATE TABLE public.payment_transition (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  snapshot_sealed boolean NOT NULL DEFAULT false,
  snapshot_at timestamptz,
  direct_insert_retired boolean NOT NULL DEFAULT false
);
INSERT INTO public.payment_transition(id) VALUES(true);
CREATE TABLE public.payment_legacy_snapshot (
  payment_id text PRIMARY KEY REFERENCES public.payment_orders(payment_id)
);
ALTER TABLE public.payment_transition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_legacy_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_transition,public.payment_legacy_snapshot FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.payment_transition,public.payment_legacy_snapshot TO service_role;
CREATE FUNCTION public.seal_payment_legacy_snapshot(p_ids text[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.payment_transition WHERE id FOR UPDATE;
  IF (SELECT snapshot_sealed FROM public.payment_transition WHERE id) THEN RAISE EXCEPTION 'Snapshot already sealed'; END IF;
  IF p_ids IS NULL OR cardinality(p_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_ids) x)
    OR EXISTS(SELECT 1 FROM unnest(p_ids) x WHERE NOT EXISTS(
      SELECT 1 FROM public.payment_orders WHERE payment_id=x AND status='pending'))
    THEN RAISE EXCEPTION 'Invalid reviewed pending manifest'; END IF;
  INSERT INTO public.payment_legacy_snapshot SELECT unnest(p_ids);
  UPDATE public.payment_transition SET snapshot_sealed=true,snapshot_at=now() WHERE id;
END; $$;
REVOKE ALL ON FUNCTION public.seal_payment_legacy_snapshot(text[]) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
