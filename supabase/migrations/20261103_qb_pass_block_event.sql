-- 11/3: 무료 저장 횟수 소진(이용권 안내)을 qb_save_fail 과 따로 센다 — 실패 건수가 실제보다 많아 보였다
ALTER TABLE public.question_bank_events DROP CONSTRAINT question_bank_events_event_check;
ALTER TABLE public.question_bank_events ADD CONSTRAINT question_bank_events_event_check CHECK(event IN ('qb_enter','qb_db_select','qb_search','qb_search_empty','qb_cart_add','qb_save_fail','qb_pass_block','qb_save','qb_file_response','qb_demo','qb_auto_generate','qb_auth_request','qb_resume','qb_clone'));
