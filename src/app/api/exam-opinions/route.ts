import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { createClient } from '@/utils/supabase/server';
import { buildSourceDbId } from '@/lib/examKey';

export const dynamic = 'force-dynamic';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reasons = new Set(['발상·조건 해석', '계산량', '개념 융합', '시간 부족']);

export async function GET(req: NextRequest) {
    const examId = req.nextUrl.searchParams.get('examId');
    if (!examId || !uuid.test(examId)) return NextResponse.json({ message: '시험지를 확인해주세요.' }, { status: 400 });
    const admin = createAdminClient();
    const { data: opinions, error } = await admin.from('exam_opinions')
        .select('question_number, reason, comment, created_at, user_id')
        .eq('exam_id', examId).eq('hidden', false)
        .order('created_at', { ascending: false }).limit(1000);
    if (error) return NextResponse.json({ message: '의견을 불러오지 못했습니다.' }, { status: 503 });

    const { data: { user } } = await createClient().auth.getUser();
    let todayCount = 0;
    let mine: { question_number: number; reason: string; comment: string } | null = null;
    if (user) {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const start = new Date(`${today}T00:00:00+09:00`).toISOString();
        const [{ data: myOpinion }, { count }] = await Promise.all([
            admin.from('exam_opinions').select('question_number, reason, comment').eq('exam_id', examId).eq('user_id', user.id).maybeSingle(),
            admin.from('exam_opinions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', start),
        ]);
        mine = myOpinion;
        todayCount = count || 0;
    }
    return NextResponse.json({ opinions: (opinions || []).map(({ user_id, ...item }) => item),
        mine: mine ? { question_number: mine.question_number, reason: mine.reason, comment: mine.comment } : null,
        todayCount, loggedIn: !!user }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ message: '의견을 남기려면 로그인이 필요합니다.' }, { status: 401 });
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ message: '입력 내용을 확인해주세요.' }, { status: 400 }); }
    const examId = body?.examId;
    const number = Number(body?.questionNumber);
    const reason = body?.reason;
    const comment = typeof body?.comment === 'string' ? body.comment.trim() : '';
    if (!uuid.test(examId || '') || !Number.isInteger(number) || number < 1 || !reasons.has(reason)
        || comment.length < 15 || comment.length > 400) {
        return NextResponse.json({ message: '문항 번호와 의견을 확인해주세요. 의견은 15~400자로 작성해 주세요.' }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: exam, error: examError } = await admin.from('exam_materials').select('*').eq('id', examId)
        .eq('file_type', 'PDF').eq('content_type', '해설').neq('school', 'DELETED').maybeSingle();
    if (examError || !exam) return NextResponse.json({ message: '시험지를 찾지 못했습니다.' }, { status: 404 });
    const sourceKey = buildSourceDbId(exam);
    if (!sourceKey) return NextResponse.json({ message: '문항 정보가 준비되지 않았습니다.' }, { status: 400 });
    const { count, error: countError } = await admin.from('questions').select('id', { count: 'exact', head: true }).eq('source_db_id', sourceKey);
    if (countError || !count || number > count) return NextResponse.json({ message: '문항 번호를 확인해주세요.' }, { status: 400 });

    const { data, error } = await admin.rpc('submit_exam_opinion', {
        p_exam_id: examId, p_user_id: user.id, p_question_number: number,
        p_reason: reason, p_comment: comment, p_question_count: count,
    });
    if (error) {
        const limited = error.message.includes('오늘은 이미 두 시험지');
        return NextResponse.json({ message: limited ? error.message : '의견을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: limited ? 429 : 503 });
    }
    revalidatePath(`/exam/${examId}`);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
