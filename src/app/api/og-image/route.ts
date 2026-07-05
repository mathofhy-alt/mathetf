import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// og:image 프록시 — Supabase 공개 스토리지 이미지를 자체 도메인으로 서빙
// (소셜 스크레이퍼가 supabase.co 직링크 대신 mathetf.com을 보게 함 + CDN 캐시로 이그레스 절감)
export async function GET(req: NextRequest) {
    const path = req.nextUrl.searchParams.get('path') || '';

    // 공개 스토리지 하위 경로만 허용 (경로 탈출·프로토콜 삽입 차단 — 오픈 프록시 방지)
    if (!path || path.includes('..') || path.includes('//') || /^[a-z]+:/i.test(path)) {
        return new NextResponse('Bad Request', { status: 400 });
    }

    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    if (!base) return new NextResponse('Server Misconfigured', { status: 500 });

    try {
        const upstream = await fetch(
            `${base}/storage/v1/object/public/${path.split('/').map(encodeURIComponent).join('/')}`,
            { signal: AbortSignal.timeout(10000) }
        );
        if (!upstream.ok || !upstream.body) {
            // 원본 유실 시 공통 og 이미지로 폴백 (스크레이퍼에 깨진 카드 방지)
            return NextResponse.redirect(new URL('/og-image.png', req.nextUrl.origin), 302);
        }
        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                'Content-Type': upstream.headers.get('content-type') || 'image/png',
                // 미리보기 이미지는 사실상 불변 — CDN 1년, 브라우저 1일
                'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
            },
        });
    } catch {
        return NextResponse.redirect(new URL('/og-image.png', req.nextUrl.origin), 302);
    }
}
