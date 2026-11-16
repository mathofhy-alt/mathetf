import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { storeEnabled } from '@/lib/store/config';
import { storeViewer, storeBooks } from '@/lib/store/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
    // [11/10 검수] 공개된 책이 0권이면 빈 페이지 — 색인하지 않는다(얇은 페이지 금지)
    let has = false;
    try { has = (await storeBooks(false)).length > 0; } catch { has = false; }
    const index = storeEnabled() && has;
    return { title: '서점 | 수학ETF', description: '수학ETF가 직접 만든 변형 문제집. 구매한 책을 내 개인DB에서 시험지로 만들어 보세요.', robots: { index, follow: index } };
}
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
    const viewer = await storeViewer();
    if (!viewer.allowed) notFound();
    return <div className="rd store"><Header />{!storeEnabled() && <div className="store-preview">관리자 미리보기 · 서점은 아직 공개되지 않았습니다. <a href="/admin/store">책 관리</a></div>}{children}</div>;
}
