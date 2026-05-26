import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { requireAdmin } from '@/utils/admin-auth';

/**
 * POST /api/admin/questions/images/batch
 * body: { ids: string[] }
 * 여러 이미지 ID를 한 번에 받아 일괄 반환 (N번 → 1번 요청)
 */
export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const body = await req.json();
    const ids: string[] = body.ids || [];

    if (!ids.length) {
        return NextResponse.json({ results: {} });
    }

    const supabase = createAdminClient();

    try {
        const { data, error } = await supabase
            .from('question_images')
            .select('id, data, format')
            .in('id', ids);

        if (error) {
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        const results: Record<string, { data: string; format: string }> = {};
        (data || []).forEach((img: any) => {
            results[img.id] = { data: img.data, format: img.format };
        });

        return NextResponse.json({ results });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
