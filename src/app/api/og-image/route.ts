import { NextRequest, NextResponse } from 'next/server';
import { storageKey } from '@/lib/storage-key';

export const dynamic = 'force-dynamic';

// og:image 프록시 — Supabase 공개 스토리지 이미지를 자체 도메인으로 서빙
// (소셜 스크레이퍼가 supabase.co 직링크 대신 mathetf.com을 보게 함 + CDN 캐시로 이그레스 절감)
export async function GET(req: NextRequest) {
    const path = req.nextUrl.searchParams.get('path') || '';

    const [bucket, ...parts] = path.split('/');
    const key = storageKey(parts.join('/'));
    const types: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
    const ext = key?.split('.').pop()?.toLowerCase() || '';
    if (!['exam-previews','mock-previews','question-assets','hwpx'].includes(bucket) || !key || parts.some(p => p.toLowerCase() === 'raw_uploads') || !types[ext]) {
        return new NextResponse('Bad Request', { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
    if (!base) return new NextResponse('Server Misconfigured', { status: 500 });

    try {
        const upstream = await fetch(
            `${base}/storage/v1/object/public/${path.split('/').map(encodeURIComponent).join('/')}`,
            { signal: AbortSignal.timeout(10000), redirect: 'error', cache: 'no-store' }
        );
        if (!upstream.ok || !upstream.body) {
            // 원본 유실 시 공통 og 이미지로 폴백 (스크레이퍼에 깨진 카드 방지)
            return NextResponse.redirect(new URL('/og-image.png', req.nextUrl.origin), 302);
        }
        const mime = upstream.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
        if (mime !== types[ext]) {
            await upstream.body.cancel();
            return new NextResponse('Unsupported Image', { status: 415, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
        }
        return new NextResponse(upstream.body, {
            status: 200,
            headers: {
                'Content-Type': mime,
                'X-Content-Type-Options': 'nosniff',
                'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            },
        });
    } catch {
        return NextResponse.redirect(new URL('/og-image.png', req.nextUrl.origin), 302);
    }
}
