-- [11/16] 시험지 만들기 화면이 보내는데 허용 목록에 없어 400 으로 버려지던 이벤트 4개를 받는다.
--   qb_login_wall: 비로그인 방문(10/26 비로그인 차단 뒤 기록 0) · qb_generate_click · qb_ladder · qb_autogen
alter table question_bank_events drop constraint question_bank_events_event_check;
alter table question_bank_events add constraint question_bank_events_event_check check (event = any (array[
  'qb_enter','qb_db_select','qb_search','qb_search_empty','qb_cart_add','qb_save_fail','qb_pass_block','qb_save',
  'qb_file_response','qb_demo','qb_auto_generate','qb_auth_request','qb_resume','qb_clone',
  'qb_login_wall','qb_generate_click','qb_ladder','qb_autogen']));
