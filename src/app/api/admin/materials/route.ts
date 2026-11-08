import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const url = new URL(req.url);
    const admin = createAdminClient();
    const rows: any[] = [];
    for (let from = 0; ; from += 1000) {
        let query = admin.from('exam_materials').select('*').order('id').range(from, from + 999);
        if (url.searchParams.get('raw') === '1') query = query.eq('content_type', '원본제보');
        else {
            for (const key of ['region', 'district', 'exam_year']) {
                const value = url.searchParams.get(key);
                if (value) query = query.eq(key, value);
            }
        }
        const { data, error } = await query;
        if (error) return NextResponse.json({ error: '자료 목록을 불러오지 못했습니다.' }, { status: 503 });
        rows.push(...data || []);
        if (!data || data.length < 1000) break;
    }
    return NextResponse.json({ rows }, { headers: { 'Cache-Control': 'private, no-store' } });
}
