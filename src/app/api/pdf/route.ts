import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { prepareBundle, logBundleDownload, BundleError } from '@/lib/planBundles';
import { stampMemberId } from '@/lib/hml-v2/member-stamp';
import { savedExamVerified } from '@/lib/savedExamAccess';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/pdf  { ids: string[], title?: string, source?: 'predict' | 'print' } 또는 { examId }(저장한 시험지)  → { id }
 * [2026-10-25 대표 "pdf 받기"] 버셀은 한글을 못 돌린다. 한글 파일은 지금처럼 여기서 만들고(buildPredictHml — 한글 받기와 같은 내용),
 * 저장소 pdf-jobs/<id>.hml 에 올린 뒤 pdf_jobs 에 작업을 넣는다. 아이윈브 윈도우 서버(tools/pdf_worker)가 가져가 PDF 로 바꾼다.
 * 화면은 GET /api/pdf/<id> 로 끝났는지 본다. 파일을 먼저 올리고 작업을 넣는다(일꾼이 빈 파일을 집지 않게).
 */
export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    try {
        const body = await req.json().catch(() => ({}));
        const admin = createAdminClient();
        // 저장한 시험지 PDF — 현재 이용권/잔여 횟수와 무관하게 본인 보관함에서 다시 받는다.
        if (typeof body?.examId === 'string') {
            if (!UUID_RE.test(body.examId)) return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 400 });
            const { data: item } = await admin.from('user_items').select('reference_id, name, type, details').eq('id', body.examId).eq('user_id', user.id).maybeSingle();
            if (!item || item.type !== 'saved_exam') return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 404 });
            if (!await savedExamVerified(user.id, body.examId, item.reference_id, item.details?.hml_path))
                return NextResponse.json({ error: '저장이 완료된 시험지만 받을 수 있습니다. 시험지 만들기에서 다시 저장해 주세요.' }, { status: 403 });
            const lockedPath = item.details?.hml_path;
            if (lockedPath && lockedPath !== `locked/${user.id}/${item.reference_id}.hml`)
                return NextResponse.json({ error: '시험지 파일 경로를 확인할 수 없습니다.' }, { status: 403 });
            const { data: existing, error: lookupError } = await admin.from('pdf_jobs').select('id, status')
                .eq('user_id', user.id).eq('kind', 'exam').eq('set_hash', body.examId.toLowerCase())
                .in('status', ['pending', 'working', 'done']).order('created_at', { ascending: false });
            if (lookupError) throw new Error('진행 중인 PDF를 확인하지 못했습니다.');
            const active = existing?.find(j => j.status === 'pending' || j.status === 'working');
            if (active) return NextResponse.json({ id: active.id });
            for (const done of existing || []) {
                // 워커 정리로 파일이 없어진 done 작업은 새로 변환한다. 회원 표시 사본도 재사용 가능하다.
                for (const suffix of ['.m.pdf', '.pdf']) {
                    const { data } = await admin.storage.from('pdf-jobs').createSignedUrl(`${done.id}${suffix}`, 60);
                    if (data?.signedUrl) return NextResponse.json({ id: done.id });
                }
            }
            const { data: file, error: dlError } = await admin.storage.from('exams').download(lockedPath || `${user.id}/${item.reference_id}.hml`);
            if (dlError || !file) throw new Error('시험지 파일을 찾지 못했습니다.');
            const content = await file.text();
            // 파일을 읽는 사이 옛 회원 경로가 덮어써진 경우에도 다른 내용을 PDF로 넘기지 않는다.
            if (!await savedExamVerified(user.id, body.examId, item.reference_id, lockedPath))
                return NextResponse.json({ error: '저장 후 변경된 시험지 파일은 받을 수 없습니다. 시험지 만들기에서 다시 저장해 주세요.' }, { status: 403 });
            const id = crypto.randomUUID();
            const up = await admin.storage.from('pdf-jobs').upload(`${id}.hml`, Buffer.from(stampMemberId(content, user.email ?? undefined), 'utf8'), { contentType: 'application/octet-stream', upsert: false });
            if (up.error) throw new Error('파일을 올리지 못했습니다.');
            const { data: job, error } = await admin.rpc('create_exam_pdf_job', {
                p_id: id, p_user: user.id, p_exam: body.examId, p_title: item.name,
            });
            if (error || !job) {
                // 명확한 DB 롤백 때만 삭제한다. 통신 단절이면 이미 접수되었을 수 있다.
                if (error?.code === 'P0001') await admin.storage.from('pdf-jobs').remove([`${id}.hml`]);
                throw new Error('PDF 작업을 만들지 못했습니다.');
            }
            if (job.id !== id) {
                await admin.storage.from('pdf-jobs').remove([`${id}.hml`]);
                return NextResponse.json({ id: job.id });
            }
            try { await admin.from('feature_usage').insert({ user_id: user.id, user_email: user.email ?? null, feature: 'exam_pdf', title: item.name }); } catch { /* 로깅 실패 무시 */ }
            return NextResponse.json({ id });
        }

        const job = await prepareBundle(user, body, 'pdf');
        await logBundleDownload(user, job, 'pdf');
        return NextResponse.json({ id: job.id });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || 'PDF 요청 실패', needPass: e instanceof BundleError && e.needPass }, { status: e instanceof BundleError ? e.status : 503 });
    }
}
