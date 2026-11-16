-- File only. Apply AFTER 20261108_store_books.sql and the deployed 11/9 payment SQL.
-- No book, series, price, purchase or order is seeded/backfilled.
BEGIN;
-- [11/10 검수] 잠금 대기 한도 — 문항·결제 표가 다른 작업에 잠겨 있으면 무한정 기다리며 결제 완료까지 막을 수 있다. 실패하면 조용한 시간에 다시 실행.
SET LOCAL lock_timeout = '3s';
DO $$ BEGIN
 IF to_regprocedure('public.create_payment_order(text,uuid,jsonb,text[],boolean,uuid,text,text)') IS NULL
 OR to_regprocedure('public.complete_payment_order_v2(text,uuid)') IS NULL THEN
   RAISE EXCEPTION 'Install the 11/9 payment RPCs first';
 END IF;
END; $$;

-- create_payment_order already holds this member lock before INSERT. Reuse it
-- here so even a privileged writer cannot race one-time completion.
CREATE OR REPLACE FUNCTION public.guard_store_payment_order() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; book public.store_books%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.items) i WHERE i->>'item_type'='STORE_BOOK') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('payment:'||NEW.user_id::text,0));
 FOR item IN SELECT value FROM jsonb_array_elements(NEW.items)
   WHERE value->>'item_type'='STORE_BOOK' ORDER BY value->>'item_id' LOOP
   -- Lock metadata until order creation commits, including concurrent unpublish.
   SELECT * INTO book FROM public.store_books WHERE id::text=item->>'item_id' FOR SHARE;
   IF NOT FOUND OR NOT book.published OR book.price IS NULL
     OR book.price::bigint IS DISTINCT FROM (item->>'price')::bigint THEN
     RAISE EXCEPTION 'Store sale changed' USING ERRCODE='P0005';
   END IF;
   IF EXISTS(SELECT 1 FROM public.purchased_items p WHERE p.user_id=NEW.user_id
     AND p.item_type='STORE_BOOK' AND p.item_id=item->>'item_id') THEN
     RAISE EXCEPTION 'Store book already purchased' USING ERRCODE='P0004';
   END IF;
 END LOOP;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS store_payment_order_guard ON public.payment_orders;
CREATE TRIGGER store_payment_order_guard BEFORE INSERT ON public.payment_orders
 FOR EACH ROW EXECUTE FUNCTION public.guard_store_payment_order();

-- Runs INSIDE v2's fulfillment subtransaction for every entry point (including
-- webhook, worker and operator completion). A failure rolls back all grants,
-- point deductions and ledgers; v2 retains its existing compensation behavior.
CREATE OR REPLACE FUNCTION public.guard_store_purchase() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.payment_orders%ROWTYPE; book public.store_books%ROWTYPE;
BEGIN
 IF NEW.item_type<>'STORE_BOOK' THEN RETURN NEW; END IF;
 SELECT * INTO o FROM public.payment_orders WHERE payment_id=NEW.payment_id;
 IF NOT FOUND OR o.user_id<>NEW.user_id OR o.status<>'pending' THEN
   RAISE EXCEPTION 'Store purchase requires a pending payment order';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(o.items) i
   WHERE i->>'item_type'='STORE_BOOK' AND i->>'item_id'=NEW.item_id
     AND (i->>'price')::bigint=NEW.price_paid) THEN
   RAISE EXCEPTION 'Store purchase must match the order';
 END IF;
 IF o.amount=0 THEN
   SELECT * INTO book FROM public.store_books WHERE id::text=NEW.item_id FOR SHARE;
   IF NOT FOUND OR NOT book.published OR book.price IS NULL THEN
     RAISE EXCEPTION 'Store sale changed' USING ERRCODE='P0005';
   END IF;
 END IF;
 -- The partial UNIQUE index is the final one-time guarantee. Do not swallow it
 -- or use ON CONFLICT DO NOTHING: v2 must roll back and compensate the order.
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS store_purchase_guard ON public.purchased_items;
CREATE TRIGGER store_purchase_guard BEFORE INSERT ON public.purchased_items
 FOR EACH ROW EXECUTE FUNCTION public.guard_store_purchase();
REVOKE ALL ON FUNCTION public.guard_store_payment_order(),public.guard_store_purchase()
 FROM PUBLIC,anon,authenticated;
COMMIT;
