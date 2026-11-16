-- [11/17 대표] 책 소개의 '원본 ↔ 변형' 나란히 보기 — [{key,name,desc,original,original_label,variant,variant_label}] (이미지는 hwpx store/samples/)
ALTER TABLE public.store_books ADD COLUMN IF NOT EXISTS examples jsonb NOT NULL DEFAULT '[]';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.store_books'::regclass AND conname='store_books_examples_check') THEN
   ALTER TABLE public.store_books ADD CONSTRAINT store_books_examples_check CHECK (jsonb_typeof(examples)='array');
 END IF;
END; $$;
