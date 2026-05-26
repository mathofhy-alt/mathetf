-- ================================================================
-- RLS 보안 패치 마이그레이션
-- 생성일: 2026-05-07T20:07:28.285Z
-- Supabase 보안 경고 대응
-- ================================================================

-- 1. questions 테이블: 현재 "allow all" 정책이 민감 데이터 노출
-- 공개 읽기는 허용하되, 쓰기는 인증된 사용자만
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for all users" ON public.questions;

CREATE POLICY "Public can read questions" 
  ON public.questions FOR SELECT 
  USING (true);

CREATE POLICY "Only authenticated users can insert questions" 
  ON public.questions FOR INSERT 
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can update questions" 
  ON public.questions FOR UPDATE 
  USING (auth.role() = 'authenticated');

CREATE POLICY "Only authenticated users can delete questions" 
  ON public.questions FOR DELETE 
  USING (auth.role() = 'authenticated');

-- 2. exam_materials 테이블: RLS 확인 및 강화
ALTER TABLE public.exam_materials ENABLE ROW LEVEL SECURITY;

-- 3. profiles 테이블: 민감한 개인정보 보호
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- 4. purchases 테이블
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- 5. payment_history 테이블
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

-- 6. notices 테이블
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

-- 7. user_items 테이블 (개인 DB) - 존재하는 경우
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'user_items') THEN
    EXECUTE 'ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage own items" ON public.user_items';
    EXECUTE $policy$
      CREATE POLICY "Users can manage own items" 
        ON public.user_items 
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- 8. point_settlements 테이블 - 존재하는 경우
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'point_settlements') THEN
    EXECUTE 'ALTER TABLE public.point_settlements ENABLE ROW LEVEL SECURITY';
    EXECUTE $policy$
      CREATE POLICY "Users can view own settlements" 
        ON public.point_settlements FOR SELECT
        USING (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- 9. phone_verifications 테이블 - 존재하는 경우
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'phone_verifications') THEN
    EXECUTE 'ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY';
    EXECUTE $policy$
      CREATE POLICY "Users can manage own verifications" 
        ON public.phone_verifications
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id)
    $policy$;
  END IF;
END $$;

-- ================================================================
-- 검증: RLS 활성화 현황 확인
-- ================================================================
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
