-- Preparation may precede compatible code; payment_resolution must exist.
-- New checkout opens only after the compatible worker completes a real dispatch.
-- Supabase-supported extensions; no Vercel secret or provider webhook needed.
BEGIN;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions,pg_temp;
DO $$ BEGIN
  IF to_regprocedure('public.record_payment_cancellation(text,text)') IS NULL
    OR to_regprocedure('public.record_payment_partial_cancellation(text)') IS NULL
    OR to_regprocedure('public.record_payment_review(text,text,text)') IS NULL
    OR to_regprocedure('public.claim_payment_reconciliation_v3(integer,text)') IS NULL
    OR to_regprocedure('public.close_payment_review(text,uuid,text,jsonb,boolean)') IS NULL
    OR to_regprocedure('public.hide_purchase(uuid,uuid)') IS NULL
    THEN RAISE EXCEPTION 'Payment resolution migration is required'; END IF;
END; $$;

CREATE TABLE public.payment_reconcile_config (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  secret text NOT NULL CHECK(length(secret)=64),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.payment_reconcile_config(id,secret) VALUES(true,encode(gen_random_bytes(32),'hex'));
ALTER TABLE public.payment_reconcile_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_reconcile_config FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.payment_reconcile_config TO service_role;

CREATE TABLE public.payment_reconcile_dispatches (
  request_id bigint PRIMARY KEY,
  dispatch_id uuid NOT NULL UNIQUE,
  scheduled_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payment_reconcile_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finished_at timestamptz NOT NULL DEFAULT now(),
  dispatch_id uuid REFERENCES public.payment_reconcile_dispatches(dispatch_id),
  results jsonb NOT NULL
);
ALTER TABLE public.payment_reconcile_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reconcile_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_reconcile_dispatches,public.payment_reconcile_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.payment_reconcile_dispatches,public.payment_reconcile_runs TO service_role;

CREATE TABLE public.payment_checkout_readiness (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO public.payment_checkout_readiness(id) VALUES(true);
ALTER TABLE public.payment_checkout_readiness ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_checkout_readiness FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.payment_checkout_readiness TO service_role;

CREATE FUNCTION public.record_payment_reconciliation_run(p_results jsonb,p_dispatch_id uuid DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  INSERT INTO public.payment_reconcile_runs(results,dispatch_id)
    VALUES(p_results,(SELECT dispatch_id FROM public.payment_reconcile_dispatches WHERE dispatch_id=p_dispatch_id));
  UPDATE public.payment_checkout_readiness SET enabled=true WHERE id=true AND p_results->>'workerHealthy'='true'
    AND EXISTS(SELECT 1 FROM public.payment_reconcile_dispatches WHERE dispatch_id=p_dispatch_id);
$$;
REVOKE ALL ON FUNCTION public.record_payment_reconciliation_run(jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_reconciliation_run(jsonb,uuid) TO service_role;

-- A successful direct probe cannot open checkout. Require the real scheduled
-- dispatch, its authenticated workerHealthy run AND pg_net's HTTP 200 receipt.
-- Per-order failures are audited in results.orderFailures, not worker liveness.
-- A stopped or failing worker closes new creation after three missed intervals.
CREATE OR REPLACE FUNCTION public.payment_checkout_ready()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT coalesce((SELECT enabled FROM public.payment_checkout_readiness WHERE id=true),false)
    AND EXISTS(SELECT 1 FROM cron.job WHERE jobname='payment-reconcile-every-five-minutes'
      AND active AND schedule='*/5 * * * *' AND command='select public.enqueue_payment_reconciliation();')
    AND EXISTS(SELECT 1 FROM public.payment_reconcile_config WHERE id=true)
    -- Use the newest dispatched result. A global provider/auth failure must
    -- close readiness immediately rather than reuse an earlier healthy run.
    AND coalesce((SELECT r.results->>'workerHealthy'='true' AND response.status_code=200
        AND d.scheduled_at>now()-interval '15 minutes' AND r.finished_at>=d.scheduled_at
      FROM public.payment_reconcile_runs r
      JOIN public.payment_reconcile_dispatches d ON d.dispatch_id=r.dispatch_id
      LEFT JOIN net._http_response response ON response.id=d.request_id
      ORDER BY d.scheduled_at DESC,r.finished_at DESC,r.id DESC LIMIT 1),false);
$$;

-- Keep the secret out of cron.job.command / job_run_details. It is read only
-- at execution and used solely for this fixed production endpoint.
CREATE FUNCTION public.enqueue_payment_reconciliation()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE request_id bigint; token text; dispatch_id uuid:=gen_random_uuid();
BEGIN
  SELECT secret INTO STRICT token FROM public.payment_reconcile_config WHERE id=true;
  SELECT net.http_post(
    url:='https://mathetf.com/api/cron/payment-reconcile',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||token,'X-Payment-Reconcile-Dispatch',dispatch_id::text),
    body:='{}'::jsonb,timeout_milliseconds:=60000
  ) INTO request_id;
  INSERT INTO public.payment_reconcile_dispatches(request_id,dispatch_id) VALUES(request_id,dispatch_id);
  RETURN request_id;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_payment_reconciliation() FROM PUBLIC,anon,authenticated,service_role;
-- pg_net holds headers briefly in its queue; browser roles must not read them.
REVOKE SELECT ON net.http_request_queue,net._http_response FROM PUBLIC,anon,authenticated;

SELECT cron.schedule('payment-reconcile-every-five-minutes','*/5 * * * *',
  'select public.enqueue_payment_reconciliation();');
COMMIT;
