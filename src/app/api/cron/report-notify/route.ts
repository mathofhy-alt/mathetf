import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { sendNotice } from '@/lib/sms';
import { grantTypedFile } from '@/lib/typedGrant';
import { notifySendAt, type NotifyWhen } from '@/lib/reportDoneNotice';

export const dynamic = 'force-dynamic';

/**
 * 원본 제보 운영자 알림 (10/9, Vercel 크론 5분마다 — vercel.json).
 * 사용자: "한 번에 받는 게 낫지. 5분 간격으로. 없으면 보내지 말고."
 *  - 아직 알리지 않은 제보(description.admin_notified 없음)를 모아 문자 한 통으로 보내고 표시한다. 없으면 아무것도 안 한다.
 *  - 최근 2시간 접수분만 본다 — 처음 켤 때 옛 제보가 한꺼번에 오지 않게, 크론이 잠깐 멈춰도 다음 회차가 주워 가게.
 *  - 문자는 운영자 계정에 가입 때 인증한 번호로. 밤에도 바로 보낸다(운영자는 새벽에 일한다).
 *
 * [10/15] 같은 크론에서 제보자 '한글 파일 완성' 문자도 보낸다 — donePass 참고.
 */
const ADMIN_USER_ID = '0f1db267-e257-460b-9549-2fdd6e6ae988';
const WINDOW_MS = 2 * 60 * 60 * 1000;

// [10/9] 단문(SMS, 90바이트 = 한글 45자) 안에 — 넘으면 장문(LMS)이라 단가가 몇 배다(사용자 지적).
const SHORT: Record<string, string> = { 확률과통계: '확통', 공통수학1: '공수1', 공통수학2: '공수2', 미적분I: '미적1', 미적분II: '미적2', 미적분: '미적', 기하: '기하', 대수: '대수', 수학I: '수1', 수학II: '수2' };
const bytes = (t: string) => [...t].reduce((n, ch) => n + (ch.charCodeAt(0) > 127 ? 2 : 1), 0);
const parse = (s: string | null) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
const examLabel = (r: any) => `${String(r.school || '').replace(/고등학교$/, '고')} ${r.grade}-${r.semester}${String(r.exam_type || '').replace(/고사$/, '')} ${SHORT[r.subject] || r.subject || ''}`.trim();
type Admin = ReturnType<typeof createAdminClient>;

export async function GET(req: NextRequest) {
    // Vercel 크론은 CRON_SECRET 이 설정돼 있으면 Bearer 로 붙여 보낸다. 없으면 열어 둔다 — 남이 불러도 '안 알린 것만 한 번' 보내므로 중복 문자는 없다.
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return new NextResponse(null, { status: 401 });
    const admin = createAdminClient();
    const [adm, done] = await Promise.all([
        adminPass(admin).catch((e: any) => ({ ok: false, error: String(e?.message || e) })),
        donePass(admin).catch((e: any) => ({ ok: false, error: String(e?.message || e) })),
    ]);
    return NextResponse.json({ admin: adm, done }, { status: adm.ok === false && done.ok === false ? 502 : 200 });
}

async function adminPass(admin: Admin): Promise<Record<string, any>> {
    const { data: rows, error } = await admin.from('exam_materials')
        .select('id, school, exam_year, grade, semester, exam_type, subject, uploader_name, description, created_at')
        .eq('content_type', '원본제보')
        .gte('created_at', new Date(Date.now() - WINDOW_MS).toISOString())
        .order('created_at', { ascending: true });
    if (error) return { ok: false, error: error.message };

    const fresh = (rows || []).filter(r => !parse(r.description).admin_notified);
    if (!fresh.length) return { ok: true, sent: 0 };

    // 첫 건만 '학교 학년-학기시험 과목'으로 줄여 적고 나머지는 '외 N건'. 연도·제보자는 관리자 화면에서 본다.
    const first = examLabel(fresh[0]);
    const tail = fresh.length > 1 ? ` 외 ${fresh.length - 1}건` : '';
    let body = first;
    while (body && bytes(`[수학ETF] 제보 ${body}${tail}`) > 90) body = [...body].slice(0, -1).join('');
    const text = `[수학ETF] 제보 ${body}${tail}`;

    const { data: au } = await admin.auth.admin.getUserById(ADMIN_USER_ID);
    const phone = (au?.user?.user_metadata as any)?.phone || au?.user?.phone;
    const sms = await sendNotice(phone, text);
    if (sms === 'dev') return { ok: true, dev: true, count: fresh.length, text };   // 개발 서버: 운영 DB 를 같이 쓰므로 표시하지 않는다
    if (sms === 'failed' || sms === 'no_phone') return { ok: false, sms, count: fresh.length };   // 표시 안 함 → 다음 회차에 다시

    // 보낸 것 표시 — 바로 직전에 다시 읽어 합친다(관리자 안내 저장과 겹쳐도 그쪽 내용을 지우지 않게)
    const at = new Date().toISOString();
    for (const r of fresh) {
        const { data: cur } = await admin.from('exam_materials').select('description').eq('id', r.id).maybeSingle();
        const d = parse(cur?.description ?? r.description);
        d.admin_notified = at;
        await admin.from('exam_materials').update({ description: JSON.stringify(d) }).eq('id', r.id);
    }
    return { ok: true, sent: fresh.length, sms };
}

/**
 * [10/15] 제보자 '한글 파일 완성' 문자 — 제보할 때 받겠다고 한 행(description.notify.sms)만.
 * 채택됐고 판매용 한글 파일이 등록돼 0원 구매가 들어가면(grantTypedFile = ready) 회원이 고른 시간대에 한 번 보내고 notify.sent_at 을 적는다.
 * 한 사람 것이 여러 건 완성되면 한 통으로. 아직 작업 중이면 다음 회차(5분 뒤)에 다시 본다. 90일 지난 제보는 보지 않는다.
 */
async function donePass(admin: Admin): Promise<Record<string, any>> {
    const { data: rows, error } = await admin.from('exam_materials')
        .select('id, uploader_id, school, grade, semester, exam_type, subject, description')
        .eq('content_type', '원본제보')
        .ilike('description', '%"notify"%')
        .gte('created_at', new Date(Date.now() - 90 * 86400_000).toISOString());
    if (error) return { ok: false, error: error.message };
    const wait = (rows || []).filter(r => { const d = parse(r.description); return d.notify?.sms === true && !d.notify.sent_at && !d.bulk && !d.rejected && r.uploader_id; });
    const ready: Record<string, any[]> = {};
    for (const r of wait) {
        const g = await grantTypedFile(r.id).catch(() => null);
        if (g?.status === 'ready') (ready[r.uploader_id] ||= []).push(r);
    }
    const out: any[] = [];
    for (const [uid, list] of Object.entries(ready)) {
        const { data: au } = await admin.auth.admin.getUserById(uid);
        const phone = (au?.user?.user_metadata as any)?.phone || au?.user?.phone;
        const tailText = ' 한글파일 완성! 마이페이지 구매내역에서 받으세요';
        let text: string;
        if (list.length > 1) text = `[수학ETF] 제보 ${list.length}건${tailText}`;
        else {
            let body = examLabel(list[0]);
            while (body && bytes(`[수학ETF] ${body}${tailText}`) > 90) body = [...body].slice(0, -1).join('');
            text = `[수학ETF] ${body}${tailText}`;
        }
        const when = (parse(list[0].description).notify?.when || 'asap') as NotifyWhen;
        const sms = await sendNotice(phone, text, { at: notifySendAt(when) });
        out.push({ uid, count: list.length, sms, text });
        if (sms === 'dev' || sms === 'failed') continue;   // 개발 서버는 표시 안 함, 실패는 다음 회차에 다시
        const at = new Date().toISOString();
        for (const r of list) {
            const { data: cur } = await admin.from('exam_materials').select('description').eq('id', r.id).maybeSingle();
            const d = parse(cur?.description ?? r.description);
            d.notify = { ...(d.notify || {}), sent_at: at, result: sms };   // no_phone 도 표시 — 번호가 없으면 계속 시도하지 않는다
            await admin.from('exam_materials').update({ description: JSON.stringify(d) }).eq('id', r.id);
        }
    }
    return { ok: true, waiting: wait.length, sent: out };
}
