-- 보관함 한도를 회원마다 다르게 (2026-10-08) — 이용권이면 50개, 아니면 20개(src/lib/qbPassConfig.ts QB_LIMITS)
-- 예전 함수는 20 이 박혀 있었다. p_limit 을 받되 기본값 20 이라, 지금 배포된 코드(p_limit 안 보냄)도 그대로 동작한다.
BEGIN;
DROP FUNCTION IF EXISTS public.save_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean);
CREATE FUNCTION public.save_exam_item(p_user_id uuid, p_folder_id uuid, p_name text, p_reference_id uuid, p_details jsonb, p_session_id uuid, p_track boolean, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.user_items%ROWTYPE;
BEGIN
 IF p_folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.folders WHERE id=p_folder_id AND user_id=p_user_id) THEN
   RAISE EXCEPTION 'Invalid folder';
 END IF;
 PERFORM id FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF (SELECT count(*) FROM public.user_items WHERE user_id=p_user_id AND type='saved_exam') >= LEAST(GREATEST(coalesce(p_limit,20),1),200) THEN RAISE EXCEPTION 'Exam limit reached'; END IF;
 INSERT INTO public.user_items(user_id,folder_id,type,name,reference_id,details)
 VALUES(p_user_id,p_folder_id,'saved_exam',p_name,p_reference_id,p_details) RETURNING * INTO result;
 IF p_track THEN
   INSERT INTO public.question_bank_events(event,event_id,source,session_id,user_id,exam_id,question_count)
   VALUES('qb_save',gen_random_uuid(),'server',p_session_id,p_user_id,result.id,(p_details->>'question_count')::integer);
 END IF;
 RETURN to_jsonb(result);
END; $$;
REVOKE ALL ON FUNCTION public.save_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean,integer) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';   -- API 가 새 함수 모양을 바로 알게
