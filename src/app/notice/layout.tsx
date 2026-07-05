import type { Metadata } from 'next';

// 공지사항: 자체 title/description/OG/canonical (없으면 홈 메타 상속 → 홈 중복으로 보임)
export const metadata: Metadata = {
    title: '공지사항 | 수학ETF',
    description: '수학ETF 공지사항 — 신규 기출 자료 업데이트, 서비스 안내, 이벤트 소식.',
    alternates: { canonical: '/notice' },
    openGraph: {
        title: '공지사항 | 수학ETF',
        description: '수학ETF 공지사항 — 신규 기출 자료 업데이트, 서비스 안내, 이벤트 소식.',
        url: 'https://mathetf.com/notice',
        siteName: '수학ETF',
        type: 'website',
        images: ['/og-image.png'],
    },
};

export default function NoticeLayout({ children }: { children: React.ReactNode }) {
    return children;
}
