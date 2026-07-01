import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// 본문이 없는 페이지 — 검색 스니펫에 푸터 사업자정보가 잡히지 않도록 색인 제외
export const metadata: Metadata = {
    title: '로그인 | 수학ETF',
    robots: { index: false, follow: false },
};

export default function NoindexLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
