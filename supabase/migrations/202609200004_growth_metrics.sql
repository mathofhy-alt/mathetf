-- Apply only in the isolated test database before deployment.
ALTER TABLE public.question_bank_events DROP CONSTRAINT question_bank_events_event_check;
ALTER TABLE public.question_bank_events ADD CONSTRAINT question_bank_events_event_check CHECK(event IN ('qb_enter','qb_db_select','qb_search','qb_search_empty','qb_cart_add','qb_save_fail','qb_save','qb_file_response','qb_demo','qb_auto_generate','qb_auth_request','qb_resume','qb_clone'));
ALTER TABLE public.question_bank_events ADD COLUMN origin text, ADD COLUMN campaign text, ADD COLUMN device text;
CREATE FUNCTION public.question_bank_growth(p_days integer DEFAULT 28) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 WITH e AS (SELECT * FROM public.question_bank_events WHERE site='mathetf'),
 recent AS (SELECT * FROM e WHERE created_at>=now()-make_interval(days=>greatest(7,least(p_days,90)))),
 first_save AS (SELECT user_id,min(created_at) AS first_at FROM e WHERE event='qb_save' AND user_id IS NOT NULL GROUP BY user_id),
 first_file AS (SELECT user_id,min(created_at) AS first_at FROM e WHERE event='qb_file_response' AND user_id IS NOT NULL GROUP BY user_id),
 mature AS (SELECT * FROM first_save WHERE first_at>=now()-make_interval(days=>greatest(7,least(p_days,90))) AND first_at<=now()-interval '7 days'),
 cohort AS (SELECT m.*,EXISTS(SELECT 1 FROM e WHERE e.user_id=m.user_id AND event='qb_save' AND created_at>m.first_at AND created_at<=m.first_at+interval '7 days') AS returned FROM mature m),
 attribution AS (SELECT DISTINCT ON(session_id) session_id,campaign,origin FROM e WHERE session_id IS NOT NULL AND source='client' ORDER BY session_id,created_at),
 channels AS (SELECT coalesce(a.campaign,a.origin,'direct') AS channel,count(DISTINCT r.session_id) FILTER(WHERE r.event='qb_enter') AS starts,count(DISTINCT r.user_id) FILTER(WHERE r.event='qb_save') AS savers,count(DISTINCT r.user_id) FILTER(WHERE r.event='qb_file_response') AS file_users,count(DISTINCT r.user_id) FILTER(WHERE r.event='qb_file_response' AND r.created_at=ff.first_at) AS first_file_users FROM recent r LEFT JOIN attribution a USING(session_id) LEFT JOIN first_file ff ON ff.user_id=r.user_id GROUP BY 1)
 SELECT jsonb_build_object('days',greatest(7,least(p_days,90)),'site','mathetf.com','measuredSince',(SELECT min(created_at) FROM e),'starts',(SELECT count(DISTINCT session_id) FROM recent WHERE event='qb_enter'),'savedUsers',(SELECT count(DISTINCT user_id) FROM recent WHERE event='qb_save'),'firstFileUsers',(SELECT count(*) FROM first_file WHERE first_at>=now()-make_interval(days=>greatest(7,least(p_days,90)))),'fileUsers',(SELECT count(DISTINCT user_id) FROM recent WHERE event='qb_file_response'),'firstSavedUsers',(SELECT count(*) FROM first_save WHERE first_at>=now()-make_interval(days=>greatest(7,least(p_days,90)))),'matureUsers',(SELECT count(*) FROM cohort),'returnedUsers',(SELECT count(*) FROM cohort WHERE returned),'emptySearches',(SELECT count(*) FROM recent WHERE event='qb_search_empty'),'saveFailures',(SELECT count(*) FROM recent WHERE event='qb_save_fail'),'channels',coalesce((SELECT jsonb_agg(channels) FROM channels),'[]'::jsonb));
 $$;
REVOKE ALL ON FUNCTION public.question_bank_growth(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.question_bank_growth(integer) TO service_role;
