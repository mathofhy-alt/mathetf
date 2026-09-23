export function safeReturnPath(value: unknown, fallback = '/'): string {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return fallback;
    try {
        const decoded = decodeURIComponent(value);
        if (decoded.startsWith('//') || /[\\\x00-\x1f]/.test(decoded)) return fallback;
        const url = new URL(value, 'https://mathetf.com');
        if (url.origin !== 'https://mathetf.com' || ['/login', '/signup'].includes(url.pathname)) return fallback;
        return url.pathname + url.search + url.hash;
    } catch { return fallback; }
}
export function questionBankLoginUrl(): string {
    if (typeof window === 'undefined') return '/login?next=%2Fquestion-bank%3Fresume%3D1';
    const url = new URL(window.location.href);
    url.searchParams.set('resume', '1');
    return '/login?next=' + encodeURIComponent(safeReturnPath(url.pathname + url.search, '/question-bank?resume=1'));
}
