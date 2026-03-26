-- 불편불만 신고 내역을 저장하는 테이블
CREATE TABLE IF NOT EXISTS exam_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    group_key TEXT NOT NULL,
    title TEXT NOT NULL,
    report_type TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'pending' NOT NULL,
    admin_memo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS Policies
ALTER TABLE exam_reports ENABLE ROW LEVEL SECURITY;

-- 누구나(인증된 사용자) 자신의 신고 내역을 추가할 수 있음
CREATE POLICY "Users can insert their own reports" ON exam_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 누구나(인증된 사용자) 자신의 신고 내역을 볼 수 있음
CREATE POLICY "Users can view own reports" ON exam_reports
    FOR SELECT USING (auth.uid() = user_id);

-- 관리자는 모든 신고 내역을 볼 수 있고, 상태나 메모를 수정할 수 있음 (기존 admin 확인 함수 사용 시)
-- * 실제 프로젝트의 admin 정책에 맞춰 추가하세요. 보통 관리자는 bypass RLS이거나 admin 플래그를 사용합니다.
