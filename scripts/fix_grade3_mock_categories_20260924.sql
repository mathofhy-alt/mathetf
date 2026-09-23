-- Applied to production on 2026-09-24 KST, one UPDATE per SQL Editor run.
-- The dashboard times out if all 322 questions are updated in one transaction.
-- EBS answer keys verified the 2023/2024/2025 papers; 2026 June matches the
-- evaluation-institute original already registered in mock_exams.
-- These updates are idempotent because they only change old '전국연합' rows.
-- source_db_id is an opaque saved source key and must remain unchanged.
-- exam_type stays '모의고사' until the catalog change supporting free CSAT
-- entries is deployed; changing it now would hide the paper on the live site.

UPDATE public.questions SET school='수능'
WHERE grade='고3' AND year='2025' AND semester='11월 모의고사' AND school='전국연합';

UPDATE public.questions SET school='평가원'
WHERE grade='고3' AND year='2023' AND semester='6월 모의고사' AND school='전국연합';

UPDATE public.questions SET school='평가원'
WHERE grade='고3' AND year='2024' AND semester='6월 모의고사' AND school='전국연합';

UPDATE public.questions SET school='평가원'
WHERE grade='고3' AND year='2025' AND semester='6월 모의고사' AND school='전국연합';

UPDATE public.questions SET school='평가원'
WHERE grade='고3' AND year='2025' AND semester='9월 모의고사' AND school='전국연합';

UPDATE public.questions SET school='평가원'
WHERE grade='고3' AND year='2026' AND semester='6월 모의고사' AND school='전국연합';

UPDATE public.questions SET school='평가원'
WHERE grade='고3' AND year='2026' AND semester='6월 모의고사변형' AND school='전국연합';

UPDATE public.exam_materials
SET school=CASE WHEN exam_year=2025 AND semester=11 THEN '수능' ELSE '평가원' END,
    title=CASE WHEN exam_year=2025 AND semester=11
      THEN '2025년 시행 2026학년도 수능 '||subject||' [개인DB]'
      ELSE replace(replace(title,'전국연합','평가원'),'모의고사','모의평가') END
WHERE grade=3 AND file_type='DB' AND school='전국연합' AND (
  (exam_year IN (2023,2024,2026) AND semester=6) OR
  (exam_year=2025 AND semester IN (6,9,11))
);

-- Expected after update: seven question groups of 46 (322 total), six
-- material groups of three (18 total). Source IDs and purchases unchanged.
