-- profiles 테이블에 주소 관련 컬럼 추가
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS postcode TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS address_detail TEXT;

-- 기존 트리거 함수 교체: auth.users 의 raw_user_meta_data에서 주소를 profiles로 넘겨주는 역할 추가
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    display_name, 
    role, 
    purchased_points, 
    earned_points,
    postcode,
    address,
    address_detail
  )
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', '유저_' || substr(NEW.id::text, 1, 5)), 
    'user', 
    0, 
    0,
    NEW.raw_user_meta_data->>'postcode',
    NEW.raw_user_meta_data->>'address',
    NEW.raw_user_meta_data->>'address_detail'
  );
  RETURN NEW;
END;
$$;
