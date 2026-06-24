import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

/**
 * 온디맨드 재검증 — 미리보기 생성 스크립트가 특정 페이지만 즉시 갱신할 때 사용.
 * 인증: x-revalidate-key 헤더 == SUPABASE_SERVICE_ROLE_KEY (스크립트가 이미 가진 키 재사용, 추가 설정 불필요)
 * body: { paths: string[] }  예: { "paths": ["/exam/abc", "/exam/def"] }
 */
export async function POST(req: NextRequest) {
    const key = req.headers.get('x-revalidate-key');
    if (!key || key !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const paths: string[] = Array.isArray(body?.paths) ? body.paths : (body?.path ? [body.path] : []);
    const done: string[] = [];
    for (const p of paths) {
        if (typeof p === 'string' && p.startsWith('/')) {
            try { revalidatePath(p); done.push(p); } catch { /* skip */ }
        }
    }
    return NextResponse.json({ ok: true, revalidated: done });
}
