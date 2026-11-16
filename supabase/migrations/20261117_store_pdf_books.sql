-- [11/17 대표] 서점: 개인DB 없이 판매용 PDF만 파는 책. source_db_id 는 비워도 되고 pdf_path(비공개 exam-materials 버킷)를 둔다.
-- 둘 중 하나는 있어야 한다. 공개 조건: 문항 묶음이 있으면 private 문항 1개 이상(기존), PDF 책이면 pdf_path 필수.
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE public.store_books ADD COLUMN IF NOT EXISTS pdf_path text;
ALTER TABLE public.store_books ALTER COLUMN source_db_id DROP NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.store_books'::regclass AND conname='store_books_pdf_path_check') THEN
   ALTER TABLE public.store_books ADD CONSTRAINT store_books_pdf_path_check CHECK (pdf_path IS NULL OR pdf_path ~ '^store/pdf/[a-z0-9]+(-[a-z0-9]+)*\.pdf$');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.store_books'::regclass AND conname='store_books_has_goods_check') THEN
   ALTER TABLE public.store_books ADD CONSTRAINT store_books_has_goods_check CHECK (source_db_id IS NOT NULL OR pdf_path IS NOT NULL);
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_store_book() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.source_db_id IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.store_books b WHERE b.id<>NEW.id AND b.source_db_id IS NOT NULL AND public.store_sources_overlap(b.source_db_id,NEW.source_db_id))
  OR EXISTS(SELECT 1 FROM public.private_dbs b WHERE public.store_sources_overlap(b.source_db_id,NEW.source_db_id))
  OR EXISTS(SELECT 1 FROM public.exam_materials m
    CROSS JOIN LATERAL unnest(string_to_array(m.source_db_id,'|')) AS s(source)
    WHERE m.source_db_id IS NOT NULL AND public.store_sources_overlap(s.source,NEW.source_db_id)) THEN
    RAISE EXCEPTION 'A store source must be separate from other books, owner-only private DBs and exam materials';
  END IF;
  IF EXISTS(SELECT 1 FROM public.questions q WHERE
    (q.source_db_id=NEW.source_db_id OR starts_with(q.source_db_id,NEW.source_db_id || ' > '))
    AND q.work_status='sorted') THEN
    RAISE EXCEPTION 'Linked questions cannot have work_status=sorted';
  END IF;
  IF EXISTS(SELECT 1 FROM public.questions q WHERE
    (q.source_db_id=NEW.source_db_id OR starts_with(q.source_db_id,NEW.source_db_id || ' > ')) AND position('|' in q.source_db_id)>0) THEN
    RAISE EXCEPTION 'Store source paths cannot contain scope separators';
  END IF;
 END IF;
 IF TG_OP='UPDATE' AND (NEW.source_db_id IS DISTINCT FROM OLD.source_db_id) AND EXISTS(
   SELECT 1 FROM public.purchased_items WHERE item_type='STORE_BOOK' AND item_id=OLD.id::text
   UNION ALL SELECT 1 FROM public.payment_orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) i
     WHERE i->>'item_type'='STORE_BOOK' AND i->>'item_id'=OLD.id::text
 ) THEN RAISE EXCEPTION 'An ordered book source cannot be changed'; END IF;
 IF NEW.published AND NEW.source_db_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.questions q WHERE q.work_status='private'
   AND (q.source_db_id=NEW.source_db_id OR starts_with(q.source_db_id,NEW.source_db_id || ' > '))) THEN
   RAISE EXCEPTION 'A published book must have private questions';
 END IF;
 IF NEW.published AND NEW.source_db_id IS NULL AND NEW.pdf_path IS NULL THEN
   RAISE EXCEPTION 'A published book must have a PDF or private questions';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_store_book() FROM PUBLIC, anon, authenticated;
COMMIT;
