import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/** 개인DB 요청 목록·상태 변경·삭제 (관리자). db_requests 는 서버만 읽고 쓴다(20261006_db_requests.sql). */
export async function GET() {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const sb = createAdminClient();
    const { data, error } = await sb.from('db_requests').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) return NextResponse.json({ error: '요청 목록을 불러오지 못했습니다.' }, { status: 500 });
    // 연결된 전용 개인DB 상품과 결제 여부 (10/6)
    const ids = (data || []).map(r => r.id);
    const { data: privs } = ids.length ? await sb.from('private_dbs').select('*').in('request_id', ids) : { data: [] as any[] };
    const { data: paid } = privs?.length ? await sb.from('purchased_items').select('item_id, created_at').eq('item_type', 'PRIVATE_DB').in('item_id', privs.map(p => p.id)) : { data: [] as any[] };
    const paidAt = new Map((paid || []).map(p => [p.item_id, p.created_at]));
    const byReq = new Map((privs || []).map(p => [p.request_id, { ...p, paid_at: paidAt.get(p.id) ?? null }]));
    return NextResponse.json({ requests: (data || []).map(r => ({ ...r, private_db: byReq.get(r.id) ?? null })) });
}

/**
 * POST { action:'link', id, source_db_id, title, price } — 요청을 '회원 전용 개인DB' 상품으로 연결 (10/6).
 * 그 문항 묶음 전체를 work_status='private' 로 바꿔 다른 회원의 모든 기능에서 빼고, private_dbs 에 상품을 만든다.
 * 같은 묶음을 가리키는 공개 자료(exam_materials) 행이 있으면 거부 — 그 행이 홈·학교 페이지에 공개되기 때문.
 */
export async function POST(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'link') return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
    const source = String(body.source_db_id || '').trim();
    const title = String(body.title || '').trim().slice(0, 100);
    const price = Number(body.price);
    if (typeof body.id !== 'string' || !source || !title) return NextResponse.json({ error: '문항 묶음 이름과 상품 이름을 입력해주세요.' }, { status: 400 });
    if (!Number.isSafeInteger(price) || price < 0 || price > 10_000_000) return NextResponse.json({ error: '가격은 0원 이상 정수로 입력해주세요.' }, { status: 400 });

    const sb = createAdminClient();
    const { data: request } = await sb.from('db_requests').select('id, user_id').eq('id', body.id).maybeSingle();
    if (!request) return NextResponse.json({ error: '요청을 찾지 못했습니다.' }, { status: 404 });

    const [{ data: qs, error: qErr }, { data: publicRows }, { data: existing }] = await Promise.all([
        sb.from('questions').select('subject, grade, work_status').eq('source_db_id', source).limit(1000),
        sb.from('exam_materials').select('id, title').eq('source_db_id', source).limit(5),
        sb.from('private_dbs').select('id, owner_user_id, request_id').eq('source_db_id', source).maybeSingle(),
    ]);
    if (qErr) return NextResponse.json({ error: '문항을 확인하지 못했습니다.' }, { status: 500 });
    if (!qs?.length) return NextResponse.json({ error: `'${source}' 문항 묶음이 없습니다. 등록된 source_db_id 를 확인해주세요.` }, { status: 400 });
    if (publicRows?.length) return NextResponse.json({ error: `이 묶음을 가리키는 공개 자료가 있습니다(${publicRows.map(r => r.title).join(', ')}). 공개 페이지에 노출되니 먼저 그 자료를 지워주세요.` }, { status: 409 });
    if (existing && existing.owner_user_id !== request.user_id) return NextResponse.json({ error: '이 묶음은 이미 다른 회원의 전용 DB로 연결돼 있습니다.' }, { status: 409 });

    const most = (key: 'subject' | 'grade') => {
        const c = new Map<string, number>();
        for (const q of qs) if (q[key]) c.set(String(q[key]), (c.get(String(q[key])) || 0) + 1);
        return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    // 먼저 문항을 숨기고(실패해도 공개되지 않는 쪽), 그다음 상품을 만든다
    const { error: hideErr } = await sb.from('questions').update({ work_status: 'private' }).eq('source_db_id', source).neq('work_status', 'private');
    if (hideErr) return NextResponse.json({ error: `문항을 전용으로 바꾸지 못했습니다: ${hideErr.message}` }, { status: 500 });
    const row = { owner_user_id: request.user_id, request_id: request.id, title, source_db_id: source, subject: most('subject'), grade: most('grade'), price };
    const { data: saved, error: saveErr } = existing
        ? await sb.from('private_dbs').update(row).eq('id', existing.id).select('*').single()
        : await sb.from('private_dbs').insert(row).select('*').single();
    if (saveErr) return NextResponse.json({ error: `상품을 저장하지 못했습니다: ${saveErr.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, privateDb: saved, questions: qs.length });
}

export async function PATCH(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    // status 와 admin_reply(회원 마이페이지에 보이는 안내문, 10/6) 중 온 것만 바꾼다.
    const { id, status, admin_reply } = await req.json().catch(() => ({}));
    if (typeof id !== 'string') return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if (status !== undefined) {
        if (!['접수', '처리중', '완료', '반려'].includes(status)) return NextResponse.json({ error: '상태를 확인해주세요.' }, { status: 400 });
        patch.status = status;
    }
    if (admin_reply !== undefined) {
        const text = String(admin_reply ?? '').trim().slice(0, 2000);
        patch.admin_reply = text || null;
        patch.replied_at = text ? new Date().toISOString() : null;
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: '바꿀 내용이 없습니다.' }, { status: 400 });
    const { data, error } = await createAdminClient().from('db_requests').update(patch).eq('id', id).select('status, admin_reply, replied_at').single();
    if (error) return NextResponse.json({ error: '저장하지 못했습니다.' }, { status: 500 });
    return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const { id } = await req.json().catch(() => ({}));
    if (typeof id !== 'string') return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: row } = await admin.from('db_requests').select('files').eq('id', id).maybeSingle();
    if (!row) return NextResponse.json({ error: '요청을 찾지 못했습니다.' }, { status: 404 });
    const paths = (Array.isArray(row.files) ? row.files : []).map((f: any) => f?.path).filter((p: unknown) => typeof p === 'string');
    if (paths.length) {
        const { error } = await admin.storage.from('exam-materials').remove(paths);
        if (error) return NextResponse.json({ error: `파일을 지우지 못했습니다: ${error.message}` }, { status: 500 });
    }
    const { error } = await admin.from('db_requests').delete().eq('id', id);
    if (error) return NextResponse.json({ error: `요청을 지우지 못했습니다: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, files: paths.length });
}
