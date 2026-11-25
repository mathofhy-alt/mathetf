-- [2026-11-25] 회원 탈퇴(대표 지시) — 공개 스키마의 회원 기록을 한 트랜잭션으로 정리한다.
-- 반환 jsonb: { mode: 'deleted' | 'anonymize', objects: [{bucket, name}] }
--   deleted   = 거래 기록 없음 → 이 함수 안에서 auth.users 까지 지운다(프로필·신원 등 CASCADE, 반쪽 상태 없음)
--   anonymize = 거래 기록 있음(결제·구매·포인트·정산·제보 수익·판매) → 전자상거래법 등 보관 대상이라 계정은 남기고,
--               이 함수가 프로필·로그인 신원(identity_data)의 개인정보를 비운 뒤 API 가 이메일·메타데이터를 지우고 로그인을 막는다.
--   objects   = 지울 저장소 파일(저장 시험지·PDF 발급·개인DB 요청 첨부). DB 행만 지워서는 파일이 남으므로 API 가 저장소 API 로 지운다.
-- 서비스 키(API 라우트)만 호출한다.
drop function if exists public.withdraw_account(uuid);
create or replace function public.withdraw_account(p_uid uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    has_txn boolean;
    objs jsonb;
begin
    select exists (select 1 from payment_orders where user_id = p_uid)
        or exists (select 1 from payment_history where user_id = p_uid)
        or exists (select 1 from purchases where user_id = p_uid or seller_id = p_uid)
        or exists (select 1 from point_transactions where user_id = p_uid)
        or exists (select 1 from settlement_requests where user_id = p_uid)
        or exists (select 1 from submission_earnings where buyer_id = p_uid or submitter_id = p_uid)
        or exists (select 1 from payment_review_decisions where actor_id = p_uid)
      into has_txn;

    -- 지울 저장소 파일(행을 지우기 전에 모은다). 원본 제보 사진(report_*)은 사이트 자료라 남긴다.
    select coalesce(jsonb_agg(jsonb_build_object('bucket', o.bucket_id, 'name', o.name)), '[]'::jsonb) into objs
      from storage.objects o
     where (o.bucket_id = 'exams' and (o.name like p_uid::text || '/%' or o.name like 'locked/' || p_uid::text || '/%'))
        or (o.bucket_id = 'pdf-jobs' and exists (select 1 from pdf_jobs j where j.user_id = p_uid and o.name like j.id::text || '.%'))
        or (o.bucket_id = 'exam-materials' and o.name like p_uid::text || '/dbreq_%');

    -- 개인 이용 기록·작성물: 지운다
    delete from bundle_selections where user_id = p_uid;
    delete from cart_items where user_id = p_uid;
    delete from db_requests where user_id = p_uid;
    delete from exam_opinion_rewards where user_id = p_uid;
    delete from exam_opinions where user_id = p_uid;
    delete from exam_papers where user_id = p_uid;
    delete from exam_reports where user_id = p_uid;
    delete from exam_save_backfill_candidates where user_id = p_uid;
    delete from folders where user_id = p_uid;
    delete from purchase_list_hides where user_id = p_uid;
    delete from qb_chat_logs where user_id = p_uid;
    delete from qb_save_requests where user_id = p_uid;
    delete from question_bank_events where user_id = p_uid;
    delete from suggestions where author_id = p_uid;
    delete from user_items where user_id = p_uid;
    delete from private_dbs where owner_user_id = p_uid;    -- 회원 전용 개인DB 연결(문항은 공개되지 않은 채 남는다)

    -- 원본 제보로 들어온 시험지 자료는 사이트 자료로 남기고 올린 사람·메모만 지운다
    update exam_materials
       set uploader_id = null, uploader_name = '탈퇴 회원',
           description = case when content_type = '원본제보' and description is not null and description ~ '^\s*\{'
                              then (description::jsonb - 'note')::text else description end
     where uploader_id = p_uid;

    if not has_txn then
        -- 거래 기록이 없으면 이용·공급 기록도 지우고 계정까지 지운다
        delete from exam_save_proofs where user_id = p_uid;
        delete from feature_usage where user_id = p_uid;
        delete from pdf_jobs where user_id = p_uid;
        delete from purchased_items where user_id = p_uid;
        delete from qb_usage where user_id = p_uid;
        delete from auth.users where id = p_uid;
        return jsonb_build_object('mode', 'deleted', 'objects', objs);
    end if;

    -- 거래 기록이 남는 회원: 구매·이용·발급 기록은 분쟁 처리 증빙이라 남기고(전자상거래법), 개인정보 칸만 비운다
    update feature_usage set user_email = null where user_id = p_uid;
    -- 포인트 잔액은 건드리지 않는다: 계정이 막혀 쓸 수 없으니 적립 포인트는 약관대로 소멸한 것과 같고, 원장과 잔액도 어긋나지 않는다.
    -- (충전 포인트가 남은 회원은 API 가 탈퇴 전에 막고 사용·환불을 안내한다)
    update profiles set display_name = null, postcode = null, address = null, address_detail = null,
                        persona = null, updated_at = now()
     where id = p_uid;
    -- 로그인 신원 정보(예전 가입 방식은 이름·번호·주소가 여기에도 복사돼 있다)
    update auth.identities set identity_data = jsonb_build_object('sub', p_uid::text) where user_id = p_uid;
    return jsonb_build_object('mode', 'anonymize', 'objects', objs);
end;
$$;

revoke all on function public.withdraw_account(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_account(uuid) to service_role;
