import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { requireAdmin } from '@/utils/admin-auth';
import { SUBJECT_UNITS } from '@/lib/curriculum';

export const dynamic = 'force-dynamic';

/**
 * 시험지출제 카드의 운영자 전용 「단원 옮기기」 (2026-10-20 대표: "내가 보이는 건 수동으로 이동을 시켜야 할 것 같은데").
 * - 같은 과목 안: 바로 단원을 바꾸고 예전 단원의 대표 유형을 지운다 → 기록 status='done'
 *   (새 단원 유형은 scripts/types/apply_unit_moves.py 가 붙인다 — 매일 11시 처리 끝에)
 * - 다른 과목으로: 바꾸지 않고 기록만 status='pending' — 과목을 바꾸면 회차 개인DB 에서 빠질 수 있어
 *   (9/16 120문항 사고) 같은 스크립트가 source_db_id 를 먼저 확인·채운 뒤 옮긴다.
 */
export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const { id, subject, unit } = await req.json().catch(() => ({}));
    if (typeof id !== 'string' || typeof subject !== 'string' || typeof unit !== 'string' || !(SUBJECT_UNITS[subject] || []).includes(unit)) {
        return NextResponse.json({ success: false, error: '과목·단원이 올바르지 않습니다.' }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: q, error } = await admin.from('questions').select('id, subject, unit').eq('id', id).maybeSingle();
    if (error || !q) return NextResponse.json({ success: false, error: '문항을 찾을 수 없습니다.' }, { status: 404 });
    if (q.subject === subject && q.unit === unit) return NextResponse.json({ success: true, mode: 'same', unit });

    const row = { question_id: id, from_subject: q.subject, from_unit: q.unit, to_subject: subject, to_unit: unit };
    if (q.subject !== subject) {
        // 같은 문항에 아직 처리 안 된 다른 과목 이동이 있으면 마지막 선택으로 바꾼다
        await admin.from('question_unit_moves').delete().eq('question_id', id).eq('status', 'pending');
        const { error: e2 } = await admin.from('question_unit_moves').insert({ ...row, status: 'pending' });
        if (e2) return NextResponse.json({ success: false, error: '기록하지 못했습니다: ' + e2.message }, { status: 500 });
        return NextResponse.json({ success: true, mode: 'queued', subject, unit });
    }
    const { error: e3 } = await admin.from('questions').update({ unit }).eq('id', id);
    if (e3) return NextResponse.json({ success: false, error: '단원을 바꾸지 못했습니다: ' + e3.message }, { status: 500 });
    await admin.from('question_types').delete().eq('question_id', id);
    await admin.from('question_unit_moves').insert({ ...row, status: 'done', done_at: new Date().toISOString() });
    return NextResponse.json({ success: true, mode: 'moved', subject, unit });
}
