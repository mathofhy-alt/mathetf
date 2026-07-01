import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
    title: '건의 작성 | 수학ETF',
    robots: { index: false, follow: false },
};

export default function NoindexLayout({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
