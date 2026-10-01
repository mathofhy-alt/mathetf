const TRACK_ID = '7758853385012727165';
const SCRIPT_URL = 'https://t1.daumcdn.net/kas/static/kp.js';

type Pixel = {
    pageView: () => void;
    completeRegistration: () => void;
};

declare global {
    interface Window {
        kakaoPixel?: (trackId: string) => Pixel;
    }
}

let scriptPromise: Promise<Pixel | null> | null = null;

function isProductionSite(): boolean {
    return typeof window !== 'undefined' &&
        ['mathetf.com', 'www.mathetf.com'].includes(window.location.hostname);
}

function loadPixel(): Promise<Pixel | null> {
    if (!isProductionSite()) return Promise.resolve(null);
    if (window.kakaoPixel) return Promise.resolve(window.kakaoPixel(TRACK_ID));
    if (scriptPromise) return scriptPromise;

    scriptPromise = new Promise(resolve => {
        const script = document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.onload = () => resolve(window.kakaoPixel?.(TRACK_ID) ?? null);
        script.onerror = () => resolve(null);
        document.head.appendChild(script);
    });
    return scriptPromise;
}

export function trackKakaoPageView(): void {
    void loadPixel().then(pixel => pixel?.pageView()).catch(() => {});
}

export function trackKakaoRegistration(): void {
    void loadPixel().then(pixel => pixel?.completeRegistration()).catch(() => {});
}
