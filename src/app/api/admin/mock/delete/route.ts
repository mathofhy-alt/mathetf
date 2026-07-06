import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    try {
        const { id } = await req.json().catch(() => ({}));
        if (!id) return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });

        const admin = createAdminClient();
        const { data: row } = await admin.from('mock_exams').select('id').eq('id', id).maybeSingle();
        if (!row) return NextResponse.json({ error: '대상을 찾을 수 없습니다.' }, { status: 404 });

        // 1) 원본/변형 파일 삭제 (mock-materials/{id}/*)
        const { data: files } = await admin.storage.from('mock-materials').list(id);
        if (files && files.length) {
            await admin.storage.from('mock-materials').remove(files.map((f: any) => `${id}/${f.name}`));
        }

        // 2) 미리보기 삭제 (mock-previews/{id}_*)
        const { data: prev } = await admin.storage.from('mock-previews').list('', { limit: 1000 });
        const mine = (prev || []).filter((f: any) => f.name.startsWith(`${id}_`)).map((f: any) => f.name);
        if (mine.length) await admin.storage.from('mock-previews').remove(mine);

        // 3) 행 삭제
        const { error } = await admin.from('mock_exams').delete().eq('id', id);
        if (error) throw new Error('삭제 실패: ' + error.message);

        // 모의고사 허브·상세 ISR 캐시 즉시 갱신 (삭제 반영 5분 대기 제거)
        revalidatePath('/mock');
        revalidatePath('/mock/[seg]', 'page');

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
