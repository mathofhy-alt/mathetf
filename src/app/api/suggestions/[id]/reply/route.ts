import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'mathofhy@naver.com';

// POST /api/suggestions/[id]/reply — 관리자만. 답변 저장(빈 문자열이면 삭제).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || user.email !== ADMIN_EMAIL) {
            return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        const reply = typeof body?.reply === 'string' ? body.reply.trim().slice(0, 5000) : '';

        const admin = createAdminClient();
        const { error } = await admin
            .from('suggestions')
            .update({
                admin_reply: reply || null,
                admin_replied_at: reply ? new Date().toISOString() : null,
            })
            .eq('id', params.id);
        if (error) throw error;

        return NextResponse.json({ success: true, admin_reply: reply || null });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
