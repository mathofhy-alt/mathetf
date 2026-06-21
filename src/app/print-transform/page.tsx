import Header from '@/components/Header';
import { createClient } from '@/utils/supabase/server';
import PrintTransformClient from './PrintTransformClient';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: '학교프린트 변형만들기 | 수학ETF',
    description: '학교에서 받은 수학 프린트를 올리고 문제를 잘라내면, 같은 유형의 변형문제를 자동으로 찾아 한글파일로 만들어 드립니다.',
    alternates: { canonical: '/print-transform' },
};

export default async function PrintTransformPage() {
    let isLoggedIn = false;
    try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        isLoggedIn = !!user;
    } catch { }

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans">
            <Header />
            <PrintTransformClient isLoggedIn={isLoggedIn} />
        </div>
    );
}
