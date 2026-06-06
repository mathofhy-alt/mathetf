-- ================================================================
-- 문제 콘텐츠 RLS 잠금 (스크래핑 방지)
-- 생성일: 2026-06-07
--
-- 배경: questions.content_xml / question_images 가 공개 anon 키로 누구나
--       전체 덤프 가능했음 (questions "Public can read" USING(true), question_images RLS 미적용).
--
-- 조치: 익명(anon)의 직접 읽기를 차단. 로그인 유저(authenticated)만 직접 읽기 허용.
--       비로그인 검색/맛보기는 서버 라우트(/api/questions/*, service_role)가 대신 처리하며,
--       service_role 은 RLS 를 우회하므로 영향 없음. (서버에서 페이지 상한 + 속도제한)
--
-- ⚠️ 실행 순서: 반드시 새 코드(서버 라우트 + 클라이언트 교체)를 배포한 "다음에" 실행하세요.
--    먼저 실행하면 배포 전 구버전 클라이언트의 직접 조회가 깨집니다.
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 실행 (1회).
-- ================================================================

-- ---------- 1) questions ----------
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

-- 기존 정책 전부 제거 (이름 모를 allow-all 포함 — permissive 정책이 OR 로 합쳐져 구멍이 남는 것 방지)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='questions' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.questions', pol.policyname);
  END LOOP;
END $$;

-- 읽기: 로그인 유저만 (익명 차단). 서버 service_role 은 RLS 우회.
CREATE POLICY "questions_select_authenticated"
  ON public.questions FOR SELECT
  USING (auth.role() = 'authenticated');

-- 쓰기: 로그인 유저만 (실제 쓰기는 서버 service_role 로 수행)
CREATE POLICY "questions_insert_authenticated"
  ON public.questions FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "questions_update_authenticated"
  ON public.questions FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "questions_delete_authenticated"
  ON public.questions FOR DELETE
  USING (auth.role() = 'authenticated');

-- ---------- 2) question_images ----------
ALTER TABLE public.question_images ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='question_images' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.question_images', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "question_images_select_authenticated"
  ON public.question_images FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "question_images_insert_authenticated"
  ON public.question_images FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "question_images_update_authenticated"
  ON public.question_images FOR UPDATE
  USING (auth.role() = 'authenticated');

CREATE POLICY "question_images_delete_authenticated"
  ON public.question_images FOR DELETE
  USING (auth.role() = 'authenticated');

-- ---------- 3) 검증 ----------
-- 실행 후 아래로 정책 확인:
-- SELECT tablename, policyname, cmd, roles, qual
-- FROM pg_policies WHERE schemaname='public' AND tablename IN ('questions','question_images')
-- ORDER BY tablename, cmd;
--
-- 그리고 anon 키로 questions SELECT 시 0행이어야 정상.
