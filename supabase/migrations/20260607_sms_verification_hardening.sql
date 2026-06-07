-- ================================================================
-- SMS 인증 brute-force 방지: 시도 횟수 컬럼 추가
-- 생성일: 2026-06-07
--
-- verify-sms 가 6자리 OTP를 무제한으로 시도할 수 있었음(3분 내 brute force 가능).
-- attempts 컬럼으로 시도 횟수를 추적해 5회 초과 시 잠금(재발송 필요).
-- 추가 컬럼(기본값 0)이라 기존 동작에 영향 없음. 안전.
--
-- 실행: Supabase Dashboard → SQL Editor 에 붙여넣고 실행 (1회).
-- ================================================================

ALTER TABLE public.phone_verifications
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
