-- TEST PROJECT ONLY: fnamfsijayavwakvgzaf (mathetf-staging).
-- Adds one disposable catalog item and cart row for the dedicated test user.
-- Never apply this to the live Supabase project.
BEGIN;

ALTER TABLE public.exam_materials
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS price bigint;

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  item_type text NOT NULL,
  item_id uuid NOT NULL REFERENCES public.exam_materials(id),
  title text NOT NULL,
  price bigint NOT NULL CHECK (price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='cart_items' AND policyname='Own cart items') THEN
    CREATE POLICY "Own cart items" ON public.cart_items
      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
GRANT SELECT, INSERT, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
GRANT SELECT ON public.exam_materials, public.profiles TO service_role;

INSERT INTO public.exam_materials (id, title, school, file_type, price)
VALUES ('8b872791-b928-4b21-a226-9af3df5c7e02', '테스트 전용 가상 PDF (실제 파일 없음)', '테스트학교', 'PDF', 1100)
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, school = EXCLUDED.school,
  file_type = EXCLUDED.file_type, price = EXCLUDED.price;

INSERT INTO public.cart_items (id, user_id, item_type, item_id, title, price)
VALUES ('1c73e012-94d5-4ac8-ad70-75580df0aacf', 'e3bf87b3-241a-4f9e-b385-0f7c93970d6f',
  'MOCK_EXAM', '8b872791-b928-4b21-a226-9af3df5c7e02', '테스트 전용 가상 PDF (실제 파일 없음)', 1100)
ON CONFLICT (user_id, item_id) DO NOTHING;

COMMIT;
NOTIFY pgrst, 'reload schema';
