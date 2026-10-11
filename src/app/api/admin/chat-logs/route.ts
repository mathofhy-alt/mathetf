import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

/**
 * 관리자 — AI 시험지 도우미 대화 기록(qb_chat_logs, 10/12 사용자 요청: "뭐라고 썼는지, 어떤 답이 나갔는지 보고 싶다").
 *   GET ?before=<id>&q=<검색어>&errors=1   최근 100개(더 보기는 before)
 *   GET ?id=<id>                           그 대화가 담은 문항 목록(펼칠 때만)
 */
export async function GET(req: NextRequest) {
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;
    const admin = createAdminClient();
    const sp = req.nextUrl.searchParams;

    const one = sp.get('id');
    if (one) {
        const { data: row } = await admin.from('qb_chat_logs').select('question_ids').eq('id', one).maybeSingle();
        const ids: string[] = row?.question_ids || [];
        if (!ids.length) return NextResponse.json({ questions: [] });
        const { data } = await admin.from('questions').select('id,school,year,grade,semester,question_number,subject,unit,difficulty,key_concepts').in('id', ids.slice(0, 50));
        const byId = new Map((data || []).map(q => [q.id, q]));
        return NextResponse.json({ questions: ids.map(id => byId.get(id)).filter(Boolean) });
    }

    let query = admin.from('qb_chat_logs').select('id,created_at,user_id,request,history,plan,reply,by,question_ids,ms,error').order('id', { ascending: false }).limit(100);
    const before = Number(sp.get('before'));
    if (before > 0) query = query.lt('id', before);
    const q = (sp.get('q') || '').trim();
    if (q) query = query.or(`request.ilike.%${q.replace(/[%,()]/g, ' ')}%,reply.ilike.%${q.replace(/[%,()]/g, ' ')}%`);
    if (sp.get('errors') === '1') query = query.not('error', 'is', null);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // 회원 이메일 — 한 화면 100줄 안의 사람만
    const uids = [...new Set((data || []).map(r => r.user_id).filter(Boolean))] as string[];
    const emails: Record<string, string> = {};
    await Promise.all(uids.map(async id => {
        const { data: u } = await admin.auth.admin.getUserById(id);
        if (u?.user?.email) emails[id] = u.user.email;
    }));

    // 맨 위 요약: 오늘(한국 시간) 건수·사람 수·오류·평균 시간
    const since = new Date(Date.now() + 9 * 3600_000); since.setUTCHours(0, 0, 0, 0);
    const { data: today } = await admin.from('qb_chat_logs').select('user_id,ms,error').gte('created_at', new Date(since.getTime() - 9 * 3600_000).toISOString()).limit(5000);
    const t = today || [];
    const summary = {
        count: t.length, users: new Set(t.map(r => r.user_id)).size, errors: t.filter(r => r.error).length,
        avgMs: t.length ? Math.round(t.reduce((s, r) => s + (r.ms || 0), 0) / t.length) : 0,
    };
    return NextResponse.json({ rows: (data || []).map(r => ({ ...r, email: emails[r.user_id] || null, n: (r.question_ids || []).length, question_ids: undefined })), summary });
}
