CREATE TABLE public.question_bank_events (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site text NOT NULL DEFAULT 'mathetf' CHECK(site='mathetf'),
 event text NOT NULL CHECK(event IN ('qb_enter','qb_db_select','qb_search','qb_search_empty','qb_cart_add','qb_save_fail','qb_save','qb_file_response')),
 source text NOT NULL CHECK(source IN ('client','server')), session_id uuid, user_id uuid, exam_id uuid,
 question_count integer, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(source='server' OR event NOT IN ('qb_save','qb_file_response'))
);
ALTER TABLE public.question_bank_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_bank_events FROM anon,authenticated;
GRANT ALL ON public.question_bank_events TO service_role;
CREATE INDEX qb_events_time ON public.question_bank_events(created_at);
CREATE UNIQUE INDEX qb_save_once ON public.question_bank_events(exam_id) WHERE event='qb_save';
-- The saved item and its authoritative success event commit together.
CREATE FUNCTION public.save_exam_item(p_user_id uuid, p_folder_id uuid, p_name text, p_reference_id uuid, p_details jsonb, p_session_id uuid, p_track boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result public.user_items%ROWTYPE;
BEGIN
 IF p_folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.folders WHERE id=p_folder_id AND user_id=p_user_id) THEN
   RAISE EXCEPTION 'Invalid folder';
 END IF;
 PERFORM id FROM public.profiles WHERE id=p_user_id FOR UPDATE;
 IF (SELECT count(*) FROM public.user_items WHERE user_id=p_user_id AND type='saved_exam') >= 20 THEN RAISE EXCEPTION 'Exam limit reached'; END IF;
 INSERT INTO public.user_items(user_id,folder_id,type,name,reference_id,details)
 VALUES(p_user_id,p_folder_id,'saved_exam',p_name,p_reference_id,p_details) RETURNING * INTO result;
 IF p_track THEN
   INSERT INTO public.question_bank_events(event,event_id,source,session_id,user_id,exam_id,question_count)
   VALUES('qb_save',gen_random_uuid(),'server',p_session_id,p_user_id,result.id,(p_details->>'question_count')::integer);
 END IF;
 RETURN to_jsonb(result);
END; $$;
REVOKE ALL ON FUNCTION public.save_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_item(uuid,uuid,text,uuid,jsonb,uuid,boolean) TO service_role;

CREATE FUNCTION public.question_bank_metrics(p_days integer DEFAULT 28)
RETURNS TABLE(event text,source text,events bigint,sessions bigint,users bigint,exams bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT event,source,count(*),count(DISTINCT session_id),count(DISTINCT user_id),count(DISTINCT exam_id)
 FROM public.question_bank_events WHERE site='mathetf' AND created_at>=now()-make_interval(days=>greatest(1,least(p_days,90)))
 GROUP BY event,source;
$$;
REVOKE ALL ON FUNCTION public.question_bank_metrics(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_metrics(integer) TO service_role;
