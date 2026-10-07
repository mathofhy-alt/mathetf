import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { subPattern } from '@/lib/questions/privateDb';

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
    // [10/7] 요청 없이 이메일로 바로 연결한 전용 DB(교재) — 누구에게 열려 있는지 운영자가 보고 끊을 수 있게
    const { data: direct } = await sb.from('private_dbs').select('*').is('request_id', null).order('created_at', { ascending: false });
    const emails = await emailsOf((direct || []).map(d => d.owner_user_id));
    const { data: dpaid } = direct?.length ? await sb.from('purchased_items').select('item_id, created_at').eq('item_type', 'PRIVATE_DB').in('item_id', direct.map(p => p.id)) : { data: [] as any[] };
    const dPaidAt = new Map((dpaid || []).map(p => [p.item_id, p.created_at]));
    return NextResponse.json({
        requests: (data || []).map(r => ({ ...r, private_db: byReq.get(r.id) ?? null })),
        direct: (direct || []).map(d => ({ ...d, owner_email: emails.get(d.owner_user_id) ?? null, paid_at: dPaidAt.get(d.id) ?? null })),
    });
}

/** auth 회원 이메일 ↔ id (회원 1~2천 명이라 전부 훑는다) */
async function allUsers(): Promise<{ id: string; email: string }[]> {
    const sb = createAdminClient();
    const out: { id: string; email: string }[] = [];
    for (let page = 1; page <= 20; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        for (const u of data.users) out.push({ id: u.id, email: (u.email || '').toLowerCase() });
        if (data.users.length < 1000) break;
    }
    return out;
}
async function emailsOf(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const want = new Set(ids);
    return new Map((await allUsers()).filter(u => want.has(u.id)).map(u => [u.id, u.email]));
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
    // [10/7] 연결 끊기 — 상품 줄만 지운다(문항은 전용 상태 그대로, 즉 아무에게도 안 보임)
    if (body?.action === 'unlink') {
        if (typeof body.privateDbId !== 'string') return NextResponse.json({ error: 'id가 없습니다.' }, { status: 400 });
        const { error } = await createAdminClient().from('private_dbs').delete().eq('id', body.privateDbId);
        if (error) return NextResponse.json({ error: `연결을 끊지 못했습니다: ${error.message}` }, { status: 500 });
        return NextResponse.json({ ok: true });
    }
    if (body?.action !== 'link') return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
    const source = String(body.source_db_id || '').trim();
    const title = String(body.title || '').trim().slice(0, 100);
    const price = Number(body.price);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if ((typeof body.id !== 'string' && !email) || !source || !title) return NextResponse.json({ error: '문항 묶음 이름과 상품 이름을 입력해주세요.' }, { status: 400 });
    if (!Number.isSafeInteger(price) || price < 0 || price > 10_000_000) return NextResponse.json({ error: '가격은 0원 이상 정수로 입력해주세요.' }, { status: 400 });

    const sb = createAdminClient();
    // 요청(db_requests)에서 연결하거나, 요청 없이 회원 이메일로 바로 연결(10/7 — 운영자가 고른 회원에게만 교재를 연다)
    let request: { id: string | null; user_id: string } | null;
    if (email) {
        const u = (await allUsers()).find(x => x.email === email);
        if (!u) return NextResponse.json({ error: `'${email}' 회원을 찾지 못했습니다. 가입한 이메일인지 확인해주세요.` }, { status: 404 });
        request = { id: null, user_id: u.id };
    } else {
        const { data } = await sb.from('db_requests').select('id, user_id').eq('id', body.id).maybeSingle();
        request = data;
    }
    if (!request) return NextResponse.json({ error: '요청을 찾지 못했습니다.' }, { status: 404 });

    // [10/7] 교재 이름(맨 앞 이름)을 넣으면 그 아래 '교재 > 단원 > 스텝' 묶음 전부가 한 상품이다.
    //   같은 교재를 여러 회원에게 연결할 수 있다 — 상품은 회원마다 한 줄(20261007_private_db_per_owner.sql).
    const sub = subPattern(source);
    const [{ data: qExact, error: qErr }, { data: qSub, error: qErr2 }, { count: subTotal }, { data: pubExact }, { data: pubSub }, { data: existing }] = await Promise.all([
        sb.from('questions').select('subject, grade').eq('source_db_id', source).limit(1000),
        sb.from('questions').select('subject, grade').like('source_db_id', sub).limit(1000),
        sb.from('questions').select('id', { count: 'exact', head: true }).like('source_db_id', sub),
        sb.from('exam_materials').select('id, title').eq('source_db_id', source).limit(5),
        sb.from('exam_materials').select('id, title').like('source_db_id', sub).limit(5),
        sb.from('private_dbs').select('id, owner_user_id, request_id').eq('source_db_id', source).eq('owner_user_id', request.user_id).maybeSingle(),
    ]);
    if (qErr || qErr2) return NextResponse.json({ error: '문항을 확인하지 못했습니다.' }, { status: 500 });
    const qs = [...(qExact || []), ...(qSub || [])];
    const publicRows = [...(pubExact || []), ...(pubSub || [])];
    if (!qs.length) return NextResponse.json({ error: `'${source}' 문항 묶음이 없습니다. 등록된 source_db_id 를 확인해주세요.` }, { status: 400 });
    if (publicRows.length) return NextResponse.json({ error: `이 묶음을 가리키는 공개 자료가 있습니다(${publicRows.map(r => r.title).join(', ')}). 공개 페이지에 노출되니 먼저 그 자료를 지워주세요.` }, { status: 409 });

    const most = (key: 'subject' | 'grade') => {
        const c = new Map<string, number>();
        for (const q of qs) if (q[key]) c.set(String(q[key]), (c.get(String(q[key])) || 0) + 1);
        return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    };
    // 먼저 문항을 숨기고(실패해도 공개되지 않는 쪽), 그다음 상품을 만든다
    // [10/7] 여러 줄을 한 문장으로 바꾸면 10줄만 돼도 DB 시간 제한(57014)에 걸린다(실측). 한 줄씩은 0.3초.
    //   → 한 줄씩 5개 동시에, 이 요청에서는 40초까지만 하고 남은 수를 돌려준다. 화면이 0 이 될 때까지 다시 부른다.
    //   상품 줄은 문항을 다 숨긴 뒤에만 만든다(중간에 멈춰도 공개되는 문항은 없다 — pending·private 둘 다 비공개).
    const left: string[] = [];
    for (const f of [(q: any) => q.eq('source_db_id', source), (q: any) => q.like('source_db_id', sub)]) {
        for (let from = 0; from < 20_000; from += 1000) {
            const { data, error } = await f(sb.from('questions').select('id').neq('work_status', 'private').order('id')).range(from, from + 999);
            if (error) return NextResponse.json({ error: `문항을 확인하지 못했습니다: ${error.message}` }, { status: 500 });
            left.push(...(data || []).map((r: any) => r.id));
            if ((data || []).length < 1000) break;
        }
    }
    const started = Date.now();
    while (left.length && Date.now() - started < 40_000) {
        const chunk = left.splice(0, 5);
        const results = await Promise.all(chunk.map(id => sb.from('questions').update({ work_status: 'private' }).eq('id', id)));
        const failed = results.find(x => x.error)?.error;
        if (failed) return NextResponse.json({ error: `문항을 전용으로 바꾸지 못했습니다: ${failed.message}` }, { status: 500 });
    }
    if (left.length) return NextResponse.json({ ok: false, inProgress: true, remaining: left.length }, { status: 202 });
    const row = { owner_user_id: request.user_id, request_id: request.id ?? existing?.request_id ?? null, title, source_db_id: source, subject: most('subject'), grade: most('grade'), price };
    const { data: saved, error: saveErr } = existing
        ? await sb.from('private_dbs').update(row).eq('id', existing.id).select('*').single()
        : await sb.from('private_dbs').insert(row).select('*').single();
    if (saveErr) return NextResponse.json({ error: saveErr.code === '23505' ? '이 묶음은 이미 다른 회원에게 연결돼 있습니다. 여러 회원에게 연결하려면 20261007_private_db_per_owner.sql 을 먼저 적용해야 합니다.' : `상품을 저장하지 못했습니다: ${saveErr.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, privateDb: saved, questions: (qExact?.length || 0) + (subTotal ?? qSub?.length ?? 0) });
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
