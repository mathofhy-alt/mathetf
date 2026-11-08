import { PLAN_COPY } from '@/lib/qbPassConfig';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { stampPdfMember } from '@/lib/pdfMemberStamp';
import { bundleExpired } from '@/lib/bundlePolicy';
import { assertBundleQuestions, assertJobReceipt, bundleHml, BundleError, type BundleJob } from '@/lib/planBundles';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/pdf/<id> → { status: 'pending'|'working'|'done'|'error', ahead?, url? }
 * 본인 작업만. done 이면 2분짜리 내려받기 주소(파일 이름 = 제목.pdf). ahead = 내 앞에 기다리는 작업 수.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    if (!UUID_RE.test(params.id)) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    const admin = createAdminClient();
    const { data: job } = await admin.from('pdf_jobs').select('*').eq('id', params.id).eq('user_id', user.id).single();
    if (!job || job.user_id !== user.id) return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 });
    if (bundleExpired(job)) return NextResponse.json({ status: 'error', error: PLAN_COPY.expired }, { status: 410 });
    if (['print', 'predict'].includes(job.kind)) try {
        await assertJobReceipt(user, job);
        if (job.question_ids?.length) await assertBundleQuestions(job.question_ids);
    }
    catch (e: any) { return NextResponse.json({ status: 'error', error: e.message }, { status: e instanceof BundleError ? e.status : 503 }); }
    if (job.status === 'done') {
        // 만료 직전에 발급한 주소도 보관 기한을 넘기지 않도록 짧게 발급한다.
        const name = `${(job.title || '문제').replace(/[\\/<>:"|?*]/g, '_').trim() || '문제'}.pdf`;
        const sign = async (file: string) => {
            // 서명 서버의 처리 지연을 위한 여유 60초를 남긴다. 여유보다 짧으면 URL을 발급하지 않는다.
            const ttl = job.retain_until ? Math.min(120, Math.floor((new Date(job.retain_until).getTime() - Date.now()) / 1000) - 60) : 120;
            if (ttl < 1) throw new BundleError(PLAN_COPY.expired, 410);
            const signed = await admin.storage.from('pdf-jobs').createSignedUrl(file, ttl, { download: name });
            // 서명 처리가 여유보다 오래 걸렸으면 그 URL도 내보내지 않는다.
            if (job.retain_until && new Date(job.retain_until).getTime() - Date.now() < ttl * 1000)
                throw new BundleError(PLAN_COPY.expired, 410);
            return signed;
        };
        try {
            // [10/26 대표] 받은 회원 아이디를 넣은 사본(<id>.m.pdf)을 처음 받을 때 한 번 만들고, 그다음부터는 그 사본을 준다
            const marked = `${job.id}.m.pdf`;
            const has = await sign(marked);
            if (has.data?.signedUrl) return NextResponse.json({ status: 'done', url: has.data.signedUrl });
            try {
                const { data: raw } = await admin.storage.from('pdf-jobs').download(`${job.id}.pdf`);
                if (raw && user.email) {
                    const out = await stampPdfMember(new Uint8Array(await raw.arrayBuffer()), user.email);
                    const up = await admin.storage.from('pdf-jobs').upload(marked, Buffer.from(out), { contentType: 'application/pdf', upsert: true });
                    if (!up.error) {
                        const s2 = await sign(marked);
                        if (s2.data?.signedUrl) return NextResponse.json({ status: 'done', url: s2.data.signedUrl });
                    }
                }
            } catch (e) {
                if (e instanceof BundleError) throw e;
                console.error('[pdf] 회원 표시 실패(원본으로 줌):', String(e).slice(0, 120));
            }
            const { data, error } = await sign(`${job.id}.pdf`);
            if (error || !data) {
                // 예상문제는 하루 뒤 파일이 정리돼도 같은 작업을 복원해 일/주 횟수를 다시 쓰지 않는다.
                const canRestore = job.kind === 'predict' || (job.kind === 'print' &&
                    (job.plan_charge === 'free' ? !!job.receipt_id : job.retain_until && !bundleExpired(job)));
                if (canRestore && job.question_ids?.length) try {
                    await bundleHml(job as BundleJob, user);
                    const retry = await admin.from('pdf_jobs').update({ status: 'pending', error: null, pdf_delivered: true }).eq('id', job.id).eq('user_id', user.id).eq('status', 'done');
                    if (!retry.error) return NextResponse.json({ status: 'pending', ahead: 0 });
                } catch { /* 아래의 재시도 안내 */ }
                return NextResponse.json({ status: 'error', error: 'PDF 파일을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.' });
            }
            return NextResponse.json({ status: 'done', url: data.signedUrl });
        } catch (e: any) {
            return NextResponse.json({ status: 'error', error: e.message }, { status: e instanceof BundleError ? e.status : 503 });
        }
    }
    if (job.status === 'error') return NextResponse.json({ status: 'error', error: 'PDF를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.' });
    let ahead = 0;
    if (job.status === 'pending') {
        const { count } = await admin.from('pdf_jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'working']).lt('created_at', job.created_at);
        ahead = count || 0;
    }
    return NextResponse.json({ status: job.status, ahead });
}
