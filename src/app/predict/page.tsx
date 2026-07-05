import { createAdminClient } from '@/utils/supabase/server-admin';
import { createClient } from '@/utils/supabase/server';
import Header from '@/components/Header';
import PredictClient from './PredictClient';
import type { Metadata } from 'next';

export const revalidate = 3600;

export const metadata: Metadata = {
    title: '예상문제 뽑아보기 — 우리 학교 기말 예상문제 | 수학ETF',
    description: '학교와 시험범위를 고르면 전국 기출 DB에서 그 학교 출제 스타일과 같은 유형의 실제 기출을 모아 예상문제 세트를 만들어 드립니다. 문제 PDF·HWP 다운로드.',
    alternates: { canonical: '/predict' },
    openGraph: {
        title: '예상문제 뽑아보기 | 수학ETF',
        description: '학교+시험범위 선택 → 같은 유형 실제 기출로 예상문제 세트 자동 생성.',
        url: 'https://mathetf.com/predict',
        siteName: '수학ETF',
        type: 'website',
        images: ['/og-image.png'],
    },
};

export default async function PredictPage() {
    // 문항 데이터가 있는 학교(=예상문제 잘 나오는 학교) 목록
    let richSchools: string[] = [];
    try {
        const admin = createAdminClient();
        const set = new Set<string>();
        let from = 0;
        while (true) {
            const { data, error } = await admin.from('questions').select('school').eq('work_status', 'sorted').range(from, from + 999);
            if (error || !data || data.length === 0) break;
            data.forEach((r: any) => { if (r.school) set.add(r.school); });
            if (data.length < 1000) break;
            from += 1000;
        }
        richSchools = Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
    } catch { richSchools = []; }

    let isLoggedIn = false;
    try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        isLoggedIn = !!user;
    } catch { }

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header />
            <PredictClient richSchools={richSchools} isLoggedIn={isLoggedIn} />
        </div>
    );
}
