import type { Metadata } from 'next';

// 건의사항: 자체 title/description (없으면 홈 메타 상속 → 홈 중복으로 보임). canonical 미지정 → 각 URL 자기참조.
export const metadata: Metadata = {
    title: '건의사항 | 수학ETF',
    description: '수학ETF 건의사항 — 서비스 개선 의견과 자료 요청을 남겨주세요.',
};

export default function SuggestionLayout({ children }: { children: React.ReactNode }) {
    return children;
}
