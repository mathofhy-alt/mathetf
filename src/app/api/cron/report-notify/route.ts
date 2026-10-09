import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { sendNotice } from '@/lib/sms';

export const dynamic = 'force-dynamic';

/**
 * 원본 제보 운영자 알림 (10/9, Vercel 크론 5분마다 — vercel.json).
 * 사용자: "한 번에 받는 게 낫지. 5분 간격으로. 없으면 보내지 말고."
 *  - 아직 알리지 않은 제보(description.admin_notified 없음)를 모아 문자 한 통으로 보내고 표시한다. 없으면 아무것도 안 한다.
 *  - 최근 2시간 접수분만 본다 — 처음 켤 때 옛 제보가 한꺼번에 오지 않게, 크론이 잠깐 멈춰도 다음 회차가 주워 가게.
 *  - 문자는 운영자 계정에 가입 때 인증한 번호로. 밤에도 바로 보낸다(운영자는 새벽에 일한다).
 */
const ADMIN_USER_ID = '0f1db267-e257-460b-9549-2fdd6e6ae988';
const WINDOW_MS = 2 * 60 * 60 * 1000;

export async function GET(req: NextRequest) {
    // Vercel 크론은 CRON_SECRET 이 설정돼 있으면 Bearer 로 붙여 보낸다. 없으면 열어 둔다 — 남이 불러도 '안 알린 것만 한 번' 보내므로 중복 문자는 없다.
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return new NextResponse(null, { status: 401 });

    const admin = createAdminClient();
    const { data: rows, error } = await admin.from('exam_materials')
        .select('id, school, exam_year, grade, semester, exam_type, subject, uploader_name, description, created_at')
        .eq('content_type', '원본제보')
        .gte('created_at', new Date(Date.now() - WINDOW_MS).toISOString())
        .order('created_at', { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const parse = (s: string | null) => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
    const fresh = (rows || []).filter(r => !parse(r.description).admin_notified);
    if (!fresh.length) return NextResponse.json({ ok: true, sent: 0 });

    const line = (r: any) => {
        const n = (parse(r.description).files || []).length || 1;
        return `${String(r.school || '').replace(/고등학교$/, '고')} ${r.exam_year} ${r.grade}-${r.semester} ${r.exam_type} ${r.subject} (${n}장) · ${r.uploader_name || ''}`.trim();
    };
    const shown = fresh.slice(0, 15);
    const text = [`[수학ETF] 새 원본 제보 ${fresh.length}건`, ...shown.map(line), ...(fresh.length > shown.length ? [`외 ${fresh.length - shown.length}건`] : [])].join('\n');

    const { data: au } = await admin.auth.admin.getUserById(ADMIN_USER_ID);
    const phone = (au?.user?.user_metadata as any)?.phone || au?.user?.phone;
    const sms = await sendNotice(phone, text);
    if (sms === 'dev') return NextResponse.json({ ok: true, dev: true, count: fresh.length, text });   // 개발 서버: 운영 DB 를 같이 쓰므로 표시하지 않는다
    if (sms === 'failed' || sms === 'no_phone') return NextResponse.json({ ok: false, sms, count: fresh.length }, { status: 502 });   // 표시 안 함 → 다음 회차에 다시

    // 보낸 것 표시 — 바로 직전에 다시 읽어 합친다(관리자 안내 저장과 겹쳐도 그쪽 내용을 지우지 않게)
    const at = new Date().toISOString();
    for (const r of fresh) {
        const { data: cur } = await admin.from('exam_materials').select('description').eq('id', r.id).maybeSingle();
        const d = parse(cur?.description ?? r.description);
        d.admin_notified = at;
        await admin.from('exam_materials').update({ description: JSON.stringify(d) }).eq('id', r.id);
    }
    return NextResponse.json({ ok: true, sent: fresh.length, sms });
}
