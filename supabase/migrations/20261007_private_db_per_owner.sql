-- 회원 전용 개인DB: 같은 교재를 여러 회원에게 연결 (2026-10-07)
-- 예전엔 묶음(source_db_id) 하나 = 회원 한 명이었다. 쎈 같은 교재는 여러 강사가 요청한다.
-- 상품 줄은 회원마다 하나, 같은 회원에게 같은 교재가 두 번 생기지는 않게.
ALTER TABLE public.private_dbs DROP CONSTRAINT IF EXISTS private_dbs_source_db_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS private_dbs_source_owner_key ON public.private_dbs (source_db_id, owner_user_id);
CREATE INDEX IF NOT EXISTS private_dbs_source_idx ON public.private_dbs (source_db_id);
