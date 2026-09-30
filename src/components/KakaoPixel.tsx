'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Script from 'next/script';

const TRACK_ID = '7758853385012727165';
const PENDING_REGISTRATION = 'mathetf_kakao_registration_pending';

declare global {
    interface Window {
        kakaoPixel?: (trackId: string) => {
            pageView: () => void;
            completeRegistration: () => void;
        };
    }
}

function isProductionSite() {
    return typeof window !== 'undefined' && ['mathetf.com', 'www.mathetf.com'].includes(window.location.hostname);
}

export function queueKakaoRegistration() {
    if (!isProductionSite()) return;
    try { sessionStorage.setItem(PENDING_REGISTRATION, '1'); } catch { return; }
    window.dispatchEvent(new Event('mathetf:kakao-registration'));
}

export default function KakaoPixel() {
    const pathname = usePathname();
    const [enabled, setEnabled] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => setEnabled(isProductionSite()), []);

    useEffect(() => {
        if (!ready || !isProductionSite() || !window.kakaoPixel) return;
        window.kakaoPixel(TRACK_ID).pageView();
    }, [ready, pathname]);

    useEffect(() => {
        if (!ready || !isProductionSite()) return;
        const sendRegistration = () => {
            if (!window.kakaoPixel || sessionStorage.getItem(PENDING_REGISTRATION) !== '1') return;
            window.kakaoPixel(TRACK_ID).completeRegistration();
            sessionStorage.removeItem(PENDING_REGISTRATION);
        };
        sendRegistration();
        window.addEventListener('mathetf:kakao-registration', sendRegistration);
        return () => window.removeEventListener('mathetf:kakao-registration', sendRegistration);
    }, [ready]);

    if (!enabled) return null;
    return <Script src="https://t1.daumcdn.net/kas/static/kp.js" strategy="afterInteractive" onReady={() => setReady(true)} />;
}
