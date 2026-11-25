-- [2026-11-25] 회원 탈퇴(대표 지시) — 공개 스키마의 회원 기록을 한 트랜잭션으로 정리한다.
-- 반환값: 'delete'    = 거래 기록 없음 → API 가 auth 계정을 지운다(프로필 등은 FK CASCADE)
--         'anonymize' = 거래 기록 있음(결제·구매·포인트·정산·제보 수익) → 전자상거래법 등 보관 대상이라 남기고,
--                       API 가 auth 계정의 이메일·이름·번호를 지우고 로그인을 막는다.
-- 서비스 키(API 라우트)만 호출한다.
create or replace function public.withdraw_account(p_uid uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
    has_txn boolean;
begin
    select exists (select 1 from payment_orders where user_id = p_uid)
        or exists (select 1 from payment_history where user_id = p_uid)
        or exists (select 1 from purchases where user_id = p_uid)
        or exists (select 1 from point_transactions where user_id = p_uid)
        or exists (select 1 from settlement_requests where user_id = p_uid)
        or exists (select 1 from submission_earnings where buyer_id = p_uid or submitter_id = p_uid)
        or exists (select 1 from payment_review_decisions where actor_id = p_uid)
      into has_txn;

    -- 개인 이용 기록·작성물: 지운다
    delete from bundle_selections where user_id = p_uid;
    delete from cart_items where user_id = p_uid;
    delete from db_requests where user_id = p_uid;
    delete from exam_opinion_rewards where user_id = p_uid;
    delete from exam_opinions where user_id = p_uid;
    delete from exam_papers where user_id = p_uid;
    delete from exam_reports where user_id = p_uid;
    delete from exam_save_backfill_candidates where user_id = p_uid;
    delete from exam_save_proofs where user_id = p_uid;
    delete from feature_usage where user_id = p_uid;
    delete from folders where user_id = p_uid;
    delete from pdf_jobs where user_id = p_uid;
    delete from purchase_list_hides where user_id = p_uid;
    delete from purchased_items where user_id = p_uid;      -- 약관: 탈퇴 시 구매 내역·다운로드 권한 소멸
    delete from qb_chat_logs where user_id = p_uid;
    delete from qb_save_requests where user_id = p_uid;
    delete from qb_usage where user_id = p_uid;
    delete from question_bank_events where user_id = p_uid;
    delete from suggestions where author_id = p_uid;
    delete from user_items where user_id = p_uid;
    delete from private_dbs where owner_user_id = p_uid;    -- 회원 전용 개인DB 연결(문항은 공개되지 않은 채 남는다)

    -- 원본 제보로 들어온 시험지 자료는 사이트 자료로 남기고 올린 사람만 지운다
    update exam_materials set uploader_id = null, uploader_name = '탈퇴 회원' where uploader_id = p_uid;

    if not has_txn then
        return 'delete';
    end if;

    -- 거래 기록이 남는 회원: 프로필의 개인정보만 비운다(포인트는 약관상 소멸)
    update profiles set display_name = null, postcode = null, address = null, address_detail = null,
                        persona = null, purchased_points = 0, earned_points = 0, opinion_points = 0, updated_at = now()
     where id = p_uid;
    return 'anonymize';
end;
$$;

revoke all on function public.withdraw_account(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_account(uuid) to service_role;
