-- Review and apply manually. No products, names, prices or entitlements are seeded.
BEGIN;
-- [11/10 검수] 잠금 대기 한도 — 문항·결제 표가 다른 작업에 잠겨 있으면 무한정 기다리며 결제 완료까지 막을 수 있다. 실패하면 조용한 시간에 다시 실행.
SET LOCAL lock_timeout = '3s';
CREATE TABLE IF NOT EXISTS public.store_books (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    series text NOT NULL DEFAULT '',
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    subtitle text NOT NULL DEFAULT '', grade text, subject text,
    description text NOT NULL DEFAULT '',
    contents jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(contents) = 'object'),
    contents_description text NOT NULL DEFAULT '', usage_notes text NOT NULL DEFAULT '',
    cover_path text CHECK (cover_path IS NULL OR cover_path LIKE 'store/covers/%'),
    cover_text_color text NOT NULL DEFAULT '#FFFFFF' CHECK (cover_text_color ~ '^#[0-9A-Fa-f]{6}$'),
    sample_paths jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(sample_paths) = 'array'),
    source_db_id text NOT NULL UNIQUE CHECK (length(btrim(source_db_id)) > 0 AND source_db_id = btrim(source_db_id) AND source_db_id NOT LIKE '%|%'),
    price integer CHECK (price >= 0),
    published boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Repair a partially installed table without inventing any book or price data.
-- Missing required metadata on existing rows fails the transaction for review.
ALTER TABLE public.store_books
 ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
 ADD COLUMN IF NOT EXISTS slug text NOT NULL,
 ADD COLUMN IF NOT EXISTS series text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS title text NOT NULL,
 ADD COLUMN IF NOT EXISTS subtitle text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS grade text,
 ADD COLUMN IF NOT EXISTS subject text,
 ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS contents jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS contents_description text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS usage_notes text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS cover_path text,
 ADD COLUMN IF NOT EXISTS cover_text_color text NOT NULL DEFAULT '#FFFFFF',
 ADD COLUMN IF NOT EXISTS sample_paths jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN IF NOT EXISTS source_db_id text NOT NULL,
 ADD COLUMN IF NOT EXISTS price integer,
 ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.store_books ALTER COLUMN price DROP DEFAULT, ALTER COLUMN price DROP NOT NULL;
ALTER TABLE public.store_books
 ALTER COLUMN id SET NOT NULL, ALTER COLUMN slug SET NOT NULL,
 ALTER COLUMN series SET NOT NULL, ALTER COLUMN title SET NOT NULL,
 ALTER COLUMN subtitle SET NOT NULL, ALTER COLUMN description SET NOT NULL,
 ALTER COLUMN contents SET NOT NULL, ALTER COLUMN contents_description SET NOT NULL,
 ALTER COLUMN usage_notes SET NOT NULL, ALTER COLUMN cover_text_color SET NOT NULL,
 ALTER COLUMN sample_paths SET NOT NULL, ALTER COLUMN source_db_id SET NOT NULL,
 ALTER COLUMN published SET NOT NULL, ALTER COLUMN sort_order SET NOT NULL,
 ALTER COLUMN created_at SET NOT NULL;
-- IF NOT EXISTS on a table does not restore missing constraints.
DO $$
DECLARE c record;
BEGIN
 FOR c IN SELECT * FROM (VALUES
   ('store_books_slug_check', $check$slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'$check$),
   ('store_books_title_check', 'length(btrim(title)) > 0'),
   ('store_books_contents_check', $check$jsonb_typeof(contents) = 'object'$check$),
   ('store_books_cover_path_check', $check$cover_path IS NULL OR cover_path LIKE 'store/covers/%'$check$),
   ('store_books_cover_text_color_check', $check$cover_text_color ~ '^#[0-9A-Fa-f]{6}$'$check$),
   ('store_books_sample_paths_check', $check$jsonb_typeof(sample_paths) = 'array'$check$),
   ('store_books_source_db_id_check', $check$length(btrim(source_db_id)) > 0 AND source_db_id = btrim(source_db_id) AND source_db_id NOT LIKE '%|%'$check$),
   ('store_books_price_check', 'price >= 0')
 ) AS checks(name,expression) LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.store_books'::regclass AND conname=c.name) THEN
     EXECUTE format('ALTER TABLE public.store_books ADD CONSTRAINT %I CHECK (%s)',c.name,c.expression);
   END IF;
 END LOOP;
END; $$;
CREATE UNIQUE INDEX IF NOT EXISTS store_books_pkey ON public.store_books(id);
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.store_books'::regclass AND contype='p') THEN
   ALTER TABLE public.store_books ADD CONSTRAINT store_books_pkey PRIMARY KEY USING INDEX store_books_pkey;
 END IF;
END; $$;
CREATE UNIQUE INDEX IF NOT EXISTS store_books_slug_key ON public.store_books(slug);
CREATE UNIQUE INDEX IF NOT EXISTS store_books_source_db_id_key ON public.store_books(source_db_id);
CREATE INDEX IF NOT EXISTS store_books_listing_idx ON public.store_books(published, sort_order, created_at);
ALTER TABLE public.store_books ENABLE ROW LEVEL SECURITY;
-- All reads/writes go through authorized server code; the flag cannot be bypassed with an anon key.
REVOKE ALL ON public.store_books FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.store_books TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS purchased_items_store_owner_idx ON public.purchased_items(user_id, item_id) WHERE item_type = 'STORE_BOOK';

-- 20260820_add_source_db_id.sql defines this as TEXT; catalog.ts reads it directly.
-- Validate the prerequisite schema without inspecting/rejecting existing material mappings.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.exam_materials'::regclass
   AND attname='source_db_id' AND NOT attisdropped AND atttypid IN ('text'::regtype,'varchar'::regtype)) THEN
   RAISE EXCEPTION 'exam_materials.source_db_id must exist and be text (apply 20260820_add_source_db_id.sql first)';
 END IF;
END; $$;

-- Prefix comparisons use literal starts_with, never a wildcard built from an administrator's text.
CREATE OR REPLACE FUNCTION public.store_sources_overlap(a text, b text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT a=b OR starts_with(a,b || ' > ') OR starts_with(b,a || ' > ');
$$;
CREATE OR REPLACE FUNCTION public.guard_store_book() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.store_books b WHERE b.id<>NEW.id AND public.store_sources_overlap(b.source_db_id,NEW.source_db_id))
 OR EXISTS(SELECT 1 FROM public.private_dbs b WHERE public.store_sources_overlap(b.source_db_id,NEW.source_db_id))
 -- scope.ts splits a material's source_db_id on | into explicit source grants.
 OR EXISTS(SELECT 1 FROM public.exam_materials m
   CROSS JOIN LATERAL unnest(string_to_array(m.source_db_id,'|')) AS s(source)
   WHERE m.source_db_id IS NOT NULL AND public.store_sources_overlap(s.source,NEW.source_db_id)) THEN
   RAISE EXCEPTION 'A store source must be separate from other books, owner-only private DBs and exam materials';
 END IF;
 IF TG_OP='UPDATE' AND NEW.source_db_id IS DISTINCT FROM OLD.source_db_id AND EXISTS(
   SELECT 1 FROM public.purchased_items WHERE item_type='STORE_BOOK' AND item_id=OLD.id::text
   UNION ALL SELECT 1 FROM public.payment_orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) i
     WHERE i->>'item_type'='STORE_BOOK' AND i->>'item_id'=OLD.id::text
 ) THEN RAISE EXCEPTION 'An ordered book source cannot be changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.questions q WHERE
   (q.source_db_id=NEW.source_db_id OR starts_with(q.source_db_id,NEW.source_db_id || ' > '))
   AND q.work_status='sorted') THEN
   RAISE EXCEPTION 'Linked questions cannot have work_status=sorted';
 END IF;
 IF EXISTS(SELECT 1 FROM public.questions q WHERE
   (q.source_db_id=NEW.source_db_id OR starts_with(q.source_db_id,NEW.source_db_id || ' > ')) AND position('|' in q.source_db_id)>0) THEN
   RAISE EXCEPTION 'Store source paths cannot contain scope separators';
 END IF;
 IF NEW.published AND NOT EXISTS(SELECT 1 FROM public.questions q WHERE q.work_status='private'
   AND (q.source_db_id=NEW.source_db_id OR starts_with(q.source_db_id,NEW.source_db_id || ' > '))) THEN
   RAISE EXCEPTION 'A published book must have private questions';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS store_book_guard ON public.store_books;
CREATE TRIGGER store_book_guard BEFORE INSERT OR UPDATE ON public.store_books FOR EACH ROW EXECUTE FUNCTION public.guard_store_book();

-- Prevent later ingest/reclassification from making a book's questions public.
CREATE OR REPLACE FUNCTION public.guard_store_question() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF position('|' in NEW.source_db_id)>0 AND EXISTS(SELECT 1 FROM public.store_books b
   WHERE NEW.source_db_id=b.source_db_id OR starts_with(NEW.source_db_id,b.source_db_id || ' > ')) THEN
   RAISE EXCEPTION 'Store source paths cannot contain scope separators';
 END IF;
 IF NEW.work_status='sorted' AND EXISTS(SELECT 1 FROM public.store_books b
   WHERE NEW.source_db_id=b.source_db_id OR starts_with(NEW.source_db_id,b.source_db_id || ' > ')) THEN
   RAISE EXCEPTION 'Store questions cannot have work_status=sorted';
 END IF;
 IF TG_OP='UPDATE' AND NEW.work_status='sorted' AND EXISTS(SELECT 1 FROM public.store_books b
   WHERE OLD.source_db_id=b.source_db_id OR starts_with(OLD.source_db_id,b.source_db_id || ' > ')) THEN
   RAISE EXCEPTION 'Store questions cannot be moved into the public question bank';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS store_question_guard ON public.questions;
CREATE TRIGGER store_question_guard BEFORE INSERT OR UPDATE OF source_db_id,work_status ON public.questions
 FOR EACH ROW EXECUTE FUNCTION public.guard_store_question();
CREATE OR REPLACE FUNCTION public.guard_private_store_overlap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.store_books b WHERE public.store_sources_overlap(b.source_db_id,NEW.source_db_id)) THEN
   RAISE EXCEPTION 'Store sources cannot be assigned through owner-only private DBs';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS private_store_overlap_guard ON public.private_dbs;
CREATE TRIGGER private_store_overlap_guard BEFORE INSERT OR UPDATE OF source_db_id ON public.private_dbs
 FOR EACH ROW EXECUTE FUNCTION public.guard_private_store_overlap();
-- Check only against store_books, not other legacy exam_materials/private_dbs rows.
-- No backfill validation: existing overlapping material mappings do not block migration.
CREATE OR REPLACE FUNCTION public.guard_exam_material_store_overlap() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.source_db_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.store_books b
   CROSS JOIN LATERAL unnest(string_to_array(NEW.source_db_id,'|')) AS s(source)
   WHERE public.store_sources_overlap(b.source_db_id,s.source)) THEN
   RAISE EXCEPTION 'Store sources cannot be assigned through exam materials';
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS exam_material_store_overlap_guard ON public.exam_materials;
CREATE TRIGGER exam_material_store_overlap_guard BEFORE INSERT OR UPDATE OF source_db_id ON public.exam_materials
 FOR EACH ROW EXECUTE FUNCTION public.guard_exam_material_store_overlap();
REVOKE ALL ON FUNCTION public.guard_store_book(), public.guard_store_question(), public.guard_private_store_overlap(), public.guard_exam_material_store_overlap() FROM PUBLIC, anon, authenticated;

-- 20261109_payment_supersede.sql: create_payment_order stores the quote items
-- unchanged; complete_payment_order_v2 copies their item_type/item_id unchanged.
-- v2 rolls back ALL fulfillment writes on UNIQUE failure and persists superseded
-- + refund intent for card orders. Keep that completion/compensation contract.
-- Apply 20261110_store_payment_guards.sql next for transactional sale rechecks.
COMMIT;
