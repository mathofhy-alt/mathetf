-- [10/13] 가입 화면에서 역할을 학생·학부모·강사 셋 중 하나 꼭 고르게 한다(사용자 결정).
-- profiles.persona 는 20260718 에서 ('student','teacher') 만 받게 묶여 있었다 → 'parent' 추가.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_persona_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_persona_check CHECK (persona IN ('student', 'teacher', 'parent'));
