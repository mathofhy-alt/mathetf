-- FINAL phase only: old order API instances have drained, new worker is healthy.
-- Never include in the schema preparation batch.
-- Reverse before an order-API rollback: supabase/rollback/payment_cutover.sql.
BEGIN;
DO $$ BEGIN
  IF NOT public.payment_checkout_ready() THEN RAISE EXCEPTION 'Checkout worker not ready'; END IF;
END; $$;
REVOKE INSERT ON public.payment_orders FROM PUBLIC,anon,authenticated,service_role;
UPDATE public.payment_transition SET direct_insert_retired=true WHERE id;
COMMIT;
