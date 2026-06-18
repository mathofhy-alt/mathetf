import type { Metadata } from 'next';

// 건의사항: 자체 title/description/OG/canonical (없으면 홈 메타 상속 → 홈 중복으로 보임)
export const metadata: Metadata = {
    title: '건의사항 | 수학ETF',
    description: '수학ETF 건의사항 — 서비스 개선 의견과 자료 요청을 남겨주세요.',
    alternates: { canonical: '/suggestion' },
    openGraph: {
        title: '건의사항 | 수학ETF',
        description: '수학ETF 건의사항 — 서비스 개선 의견과 자료 요청을 남겨주세요.',
        url: 'https://mathetf.com/suggestion',
        siteName: '수학ETF',
        type: 'website',
    },
};

export default function SuggestionLayout({ children }: { children: React.ReactNode }) {
    return children;
}
