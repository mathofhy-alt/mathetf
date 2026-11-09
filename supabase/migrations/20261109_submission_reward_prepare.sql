-- Independent, atomic preparation; no payment migration or scheduler dependency.
-- Old code remains supported; new code switches only after the marker is visible.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS point_transactions_submission_reward_once
  ON public.point_transactions(related_id) WHERE type='submission_reward';
-- No balance is read into application memory. Duplicate adoption or any failure
-- rolls back both writes, and a concurrent checkout uses the same profile lock.
CREATE OR REPLACE FUNCTION public.reward_submission(p_submission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.exam_materials%ROWTYPE; details jsonb;
BEGIN
  SELECT * INTO STRICT r FROM public.exam_materials WHERE id=p_submission_id FOR UPDATE;
  IF r.content_type IS DISTINCT FROM '원본제보' OR r.uploader_id IS NULL THEN RAISE EXCEPTION 'Invalid submission'; END IF;
  BEGIN
    details:=coalesce(nullif(r.description,'')::jsonb,'{}');
  EXCEPTION WHEN invalid_text_representation THEN details:='{}';
  END;
  IF details->>'bulk'='true' OR details->>'merged_into' IS NOT NULL OR details->>'rejected'='true' THEN
    RAISE EXCEPTION 'Submission cannot be adopted';
  END IF;
  INSERT INTO public.point_transactions(user_id,type,amount,description,related_id)
    VALUES(r.uploader_id,'submission_reward',5000,'기출 제보 채택 보상: '||coalesce(r.title,r.school,''),r.id);
  INSERT INTO public.profiles(id,earned_points) VALUES(r.uploader_id,5000)
    ON CONFLICT(id) DO UPDATE SET earned_points=coalesce(profiles.earned_points,0)+excluded.earned_points;
END; $$;

REVOKE ALL ON FUNCTION public.reward_submission(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reward_submission(uuid) TO service_role;
CREATE TABLE public.submission_reward_capability(installed boolean PRIMARY KEY CHECK(installed));
INSERT INTO public.submission_reward_capability VALUES(true);
ALTER TABLE public.submission_reward_capability ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submission_reward_capability FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.submission_reward_capability TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
