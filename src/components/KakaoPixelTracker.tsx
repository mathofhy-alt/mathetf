'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { trackKakaoPageView } from '@/lib/analytics/kakao-pixel';

const TRACKED_PAGES = new Set(['/', '/teacher', '/question-bank']);

export default function KakaoPixelTracker() {
    const pathname = usePathname();
    const lastTrackedPath = useRef<string | null>(null);

    useEffect(() => {
        if (!TRACKED_PAGES.has(pathname)) {
            lastTrackedPath.current = null;
            return;
        }
        if (lastTrackedPath.current === pathname) return;
        lastTrackedPath.current = pathname;
        trackKakaoPageView();
    }, [pathname]);

    return null;
}
