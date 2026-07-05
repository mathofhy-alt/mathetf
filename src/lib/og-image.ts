// og:image용 Supabase 스토리지 URL → 자체 도메인 프록시 경로 변환
// (직링크는 스토리지 이그레스 비용 + 소셜 스크레이퍼 안정성에 불리 — /api/og-image가 대신 서빙)

const STORAGE_MARKER = '/storage/v1/object/public/';

/**
 * Supabase 공개 스토리지 URL이면 /api/og-image?path=... 상대경로로 변환.
 * (root layout의 metadataBase가 https://mathetf.com 절대 URL로 풀어줌)
 * 그 외 URL(자체 /og-image.png 등)은 그대로 반환.
 */
export function proxiedOgImage(url: string): string {
    if (!url) return url;
    const i = url.indexOf(STORAGE_MARKER);
    if (i === -1) return url;
    return `/api/og-image?path=${encodeURIComponent(url.slice(i + STORAGE_MARKER.length))}`;
}
