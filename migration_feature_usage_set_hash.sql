-- feature_usage 에 문항 세트 해시 컬럼 추가
-- 목적: 같은 문항 세트를 반복 다운로드하는지(= 다운로드 실패 재시도) vs
--       매번 새 세트를 뽑아 받는지(= 정상적인 재생성) 판별
-- 실행: Supabase 대시보드 → SQL Editor 에 붙여넣고 Run
-- 안전: 컬럼 추가만 (기존 데이터·기능 영향 없음). 코드는 이 컬럼이 없어도 동작함.

ALTER TABLE feature_usage
    ADD COLUMN IF NOT EXISTS set_hash text;

COMMENT ON COLUMN feature_usage.set_hash IS
    '예상문제/프린트변형 다운로드 시 문항 id 정렬 후 sha1 앞 12자. 같은 값이 반복되면 동일 세트 재다운로드.';
