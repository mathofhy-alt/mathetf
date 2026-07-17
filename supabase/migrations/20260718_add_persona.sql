-- ============================================================
-- 1) 역할 자기응답(학생/강사)을 DB에 저장 — 강사 회원 식별·측정용.
--    주의: profiles.role 은 admin 권한 게이트(CHECK 'user'/'admin')라 건드리지 않고 별도 컬럼 사용.
-- ============================================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS persona TEXT CHECK (persona IN ('student', 'teacher'));

COMMENT ON COLUMN public.profiles.persona IS
'가입자 자기응답 역할: student(학생·학부모) / teacher(선생님·강사). NULL = 미응답. 온보딩 모달·가입 시 수집, localStorage→DB 백필(PersonaSync).';

-- ============================================================
-- 2) [보안] 자기 프로필 전(全)컬럼 수정 구멍 봉쇄.
--    기존 RLS "Users can update own profile" 은 행만 제한하고 컬럼은 제한 안 함
--    → 로그인 사용자가 REST 로 자기 purchased_points/earned_points 조작,
--      role='admin' 셀프 승격(CHECK 가 'admin' 허용)이 가능했음.
--    컬럼 단위 GRANT 로 잠금: 사용자는 자기 행의 persona 만 수정 가능.
--    서버 코드의 profiles 쓰기는 전부 service_role(관리자 키)이라 영향 없음.
-- ============================================================
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (persona) ON public.profiles TO authenticated;

-- PostgREST 스키마 캐시 갱신 (grant 변경 즉시 반영)
NOTIFY pgrst, 'reload schema';
