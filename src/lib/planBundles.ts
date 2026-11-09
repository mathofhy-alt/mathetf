import crypto from 'crypto';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { stripPrivate } from '@/lib/questions/privateDb';
import { buildPredictHml } from '@/lib/predict-hml';
import { stampMemberId } from '@/lib/hml-v2/member-stamp';
import { passStatus } from '@/lib/qbPass';
import { chooseCharge, planFeature } from '@/lib/planAccess';
import { PLAN_COPY, FREE_TRIAL } from '@/lib/qbPassConfig';
import { hwpPassOnly } from '@/lib/hwpPolicy';
import { bundleExpired, bundleHash } from '@/lib/bundlePolicy';

type Member = { id: string; email?: string | null };
export type BundleJob = { id: string; user_id: string; kind: string; title: string; status: string; created_at: string; retain_until: string | null; question_ids: string[] | null; set_hash: string | null; plan_charge: string | null; hwp_ready: boolean; pdf_delivered?: boolean; receipt_id?: string | null; revoked_at?: string | null; stamp: boolean };
export class BundleError extends Error {
    constructor(message: string, public status = 500, public needPass = false) { super(message); }
}
export const bundleLimitMessage = (source: string) => source === 'print'
    ? '프린트 변형의 남은 횟수가 없어요. 1회권·시험대비권·강사 이용권으로 계속 받을 수 있어요.'
    : PLAN_COPY.predict;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function bundleIds(raw: unknown): string[] {
    if (!Array.isArray(raw) || !raw.length || raw.length > 50 || raw.some(id => typeof id !== 'string' || !UUID_RE.test(id)))
        throw new BundleError('문항을 1~50개 선택해 주세요.', 400);
    return [...new Set((raw as string[]).map(id => id.toLowerCase()))];
}
export async function assertBundleQuestions(ids: string[]) {
    const { data, error } = await createAdminClient().from('questions').select('id, work_status, source_db_id').in('id', ids).in('work_status', ['sorted', 'private']);
    if (error) throw new BundleError('문항 조회에 실패했어요.', 503);
    const allowed = await stripPrivate(data || []);
    if (allowed.length !== ids.length) throw new BundleError('이용할 수 없는 문항이 포함되어 있어요. 문항을 다시 선택해 주세요.', 403);
}
/** 매칭/생성 응답 한 번의 발급 영수증. 문항별 이력을 합쳐 출처를 추정하지 않는다. */
export async function recordBundleSelection(user: Member, kind: 'print' | 'predict', ids: string[]) {
    const id = crypto.randomUUID();
    const { error } = await createAdminClient().from('bundle_selections').insert({ id, user_id: user.id, kind, question_ids: [...new Set(ids)], created_at: new Date().toISOString() });
    if (error) throw new BundleError('문항 출처를 저장하지 못했어요. 다시 시도해 주세요.', 503);
    return id;
}
export async function ownedBundleReceipt(user: Member, receiptId: unknown): Promise<{ kind: 'print' | 'predict'; question_ids: string[] }> {
    if (receiptId === undefined || receiptId === null || receiptId === '')
        throw new BundleError('페이지를 새로 고친 뒤 다시 받아 주세요.', 409);
    if (typeof receiptId !== 'string' || !UUID_RE.test(receiptId))
        throw new BundleError('발급 영수증이 필요해요. 다시 생성·매칭해 주세요.', 403);
    const { data, error } = await createAdminClient().from('bundle_selections').select('kind, question_ids')
        .eq('id', receiptId).eq('user_id', user.id).maybeSingle();
    if (error) throw new BundleError('발급 영수증을 확인하지 못했어요.', 503);
    if (!data || !['print', 'predict'].includes(data.kind) || !Array.isArray(data.question_ids))
        throw new BundleError('본인의 발급 영수증을 찾을 수 없어요.', 403);
    return data;
}
export async function resolveBundleSource(user: Member, ids: string[], receiptId: unknown): Promise<'print' | 'predict'> {
    const receipt = await ownedBundleReceipt(user, receiptId);
    if (!ids.every(id => receipt.question_ids.includes(id)))
        throw new BundleError('발급 영수증에 없는 문항을 섞거나 추가할 수 없어요.', 403);
    return receipt.kind;
}
/** 기존 보관함 작업의 NULL만 예외. 새 작업은 발급 때 연결된 영수증을 재검증한다. */
export async function assertJobReceipt(user: Member, job: BundleJob) {
    await assertBundleDelivery(user, job);
    if (job.receipt_id && await resolveBundleSource(user, job.question_ids || [], job.receipt_id) !== job.kind)
        throw new BundleError('묶음의 발급 영수증이 일치하지 않아요.', 403);
}
export async function assertBundleDelivery(user: Member, job: BundleJob) {
    if (job.revoked_at) throw new BundleError('취소·환불된 이용권으로 만든 묶음입니다.', 403);
    // SELECT * includes this marker only after the atomic resolution migration.
    // Old-schema file delivery keeps its deployed contract.
    if (job.revoked_at !== undefined) {
        const { data, error } = await createAdminClient().rpc('check_bundle_delivery', { p_user: user.id, p_id: job.id });
        if (error) throw new BundleError('묶음 권한을 확인하지 못했어요.', 503);
        if (data !== true) throw new BundleError('취소·환불된 이용권으로 만든 묶음입니다.', 403);
    }
}
export async function ownedPrintBundle(user: Member, id: string): Promise<BundleJob> {
    if (!UUID_RE.test(id)) throw new BundleError('잘못된 묶음 요청입니다.', 400);
    const { data, error } = await createAdminClient().from('pdf_jobs').select('*').eq('id', id).eq('user_id', user.id).eq('kind', 'print').maybeSingle();
    if (error) throw new BundleError('묶음을 확인하지 못했어요.', 503);
    if (!data || !['exam', 'once', 'teacher'].includes(data.plan_charge)) throw new BundleError('묶음을 찾을 수 없습니다.', 404);
    await assertJobReceipt(user, data);
    if (!data.retain_until || bundleExpired(data)) throw new BundleError(PLAN_COPY.expired, 410);
    if (data.status === 'error' && !data.hwp_ready && !data.pdf_delivered) throw new BundleError('실패한 PDF의 횟수는 복구되었어요. 문항을 다시 선택해 받아 주세요.', 409);
    if (data.question_ids?.length) await assertBundleQuestions(data.question_ids);
    return data as BundleJob;
}
export async function bundleHml(job: BundleJob, user: Member): Promise<string> {
    await assertBundleDelivery(user, job);
    const admin = createAdminClient();
    const { data } = await admin.storage.from('pdf-jobs').download(`${job.id}.hml`);
    let hml = data ? await data.text() : '';
    if (!hml) {
        if (!job.question_ids?.length) throw new BundleError('보관된 한글 파일을 찾지 못했어요.', 404);
        hml = await buildPredictHml(job.question_ids, job.title);
    }
    hml = stampMemberId(hml, user.email ?? user.id);
    const { error } = await admin.storage.from('pdf-jobs').upload(`${job.id}.hml`, Buffer.from(hml, 'utf8'), { contentType: 'application/octet-stream', upsert: true });
    if (error) throw new BundleError('파일 보관에 실패했어요.', 503);
    return hml;
}

/** 기존 운영 통계용 기록은 유지한다. plan_* 차감 기록과 구분되므로 재수령에도 횟수를 깎지 않는다. */
export async function logBundleDownload(user: Member, job: BundleJob, format: 'pdf' | 'hwp') {
    try {
        await createAdminClient().from('feature_usage').insert({
            user_id: user.id, user_email: user.email ?? null,
            feature: format === 'pdf' ? `${job.kind}_pdf` : job.kind,
            title: job.title, question_count: job.question_ids?.length ?? null, set_hash: job.set_hash,
        });
    } catch { /* 운영 통계 실패는 다운로드에 영향 없음 */ }
}

/** PDF·한글 공통 권한. 사용 한 줄과 작업 생성은 DB 잠금 안에서 함께 확정한다. */
export async function prepareBundle(user: Member, body: any, format: 'pdf' | 'hwp'): Promise<BundleJob> {
    const admin = createAdminClient();
    let job: BundleJob | null = null;
    if (typeof body?.jobId === 'string') {
        job = await ownedPrintBundle(user, body.jobId);
        if (body.ids !== undefined && !bundleIds(body.ids).every(id => job!.question_ids?.includes(id)))
            throw new BundleError('보관된 묶음에 없는 문항입니다.', 403);
    }
    else {
        const ids = bundleIds(body?.ids);
        const source = await resolveBundleSource(user, ids, body?.receiptId);
        const title = String(body?.title || (source === 'print' ? '학교프린트 변형문제' : '예상문제')).slice(0, 100);
        const hash = bundleHash(ids);
        await assertBundleQuestions(ids);
        const ps = await passStatus(user);
        if (format === 'hwp' && source === 'predict' && hwpPassOnly() && !ps.passUntil && !ps.admin)
            throw new BundleError('예상문제 한글은 강사 이용권 회원만 받을 수 있어요. 무료·시험대비권은 PDF로 받아 주세요.', 402, true);
        const { data: same, error: sameError } = await admin.from('pdf_jobs').select('*').eq('user_id', user.id).eq('kind', source).eq('set_hash', hash).order('created_at', { ascending: false });
        if (sameError) throw new BundleError('이용 기록을 확인하지 못했어요.', 503);
        const live = (same || []).filter(j => !j.revoked_at && (j.status !== 'error' || j.hwp_ready || j.pdf_delivered));
        const paid = live.find(j => j.plan_charge !== 'free' && !bundleExpired(j));
        // 만료 작업의 재수령 권한은 끝났지만, 새 영수증과 현재 이용권으로 새 묶음을 만들 수 있다.
        job = (paid || (format === 'pdf' && !ps.unlimited ? live.find(j => j.plan_charge === 'free') : null) || null) as BundleJob | null;
        if (!job) {
            if (!ps.unlimited && ids.length > FREE_TRIAL.questions) throw new BundleError(`한 번에 ${FREE_TRIAL.questions}문항까지 받을 수 있어요.`, 429, true);
            const kind = source === 'print' ? 'bundle' : 'predict';
            const charge = ps.unlimited ? null : chooseCharge(ps, kind, format === 'hwp');
            if (!ps.unlimited && !charge) throw new BundleError(format === 'hwp' && source === 'print'
                ? '무료 체험은 로고가 있는 PDF만 제공해요. 프린트 한글은 1회권·시험대비권·강사 이용권으로 받을 수 있어요.' : bundleLimitMessage(source), 402, true);
            const { data: busy, error: busyError } = await admin.from('pdf_jobs').select('id').eq('user_id', user.id)
                .in('status', ['pending', 'working']).gte('created_at', new Date(Date.now() - 3 * 60_000).toISOString()).limit(1);
            if (busyError) throw new BundleError('진행 중인 작업을 확인하지 못했어요.', 503);
            if (busy?.length) throw new BundleError('앞서 요청한 PDF를 만드는 중이에요. 끝난 뒤 다시 눌러 주세요.', 429);
            const id = crypto.randomUUID();
            const hml = stampMemberId(await buildPredictHml(ids, title), user.email ?? user.id);
            const up = await admin.storage.from('pdf-jobs').upload(`${id}.hml`, Buffer.from(hml, 'utf8'), { contentType: 'application/octet-stream', upsert: false });
            if (up.error) throw new BundleError('파일을 올리지 못했어요.', 503);
            // RPC가 잠금 후 구매·유효 기간·사용을 다시 읽는다. 인자는 최초 조회 스냅샷이다.
            const features = kind === 'bundle' && charge === 'exam' ? ['plan_exam_exam', 'plan_exam_bundle']
                : charge && !(kind === 'predict' && charge === 'exam') ? [planFeature(charge, kind)] : [];
            const limit = charge === 'free' ? (kind === 'bundle' ? FREE_TRIAL.bundle : FREE_TRIAL.predictDaily) : charge === 'exam' ? ps.examGranted : ps.onceTotal;
            const { data, error } = await admin.rpc('create_plan_bundle', {
                p_id: id, p_user: user.id, p_email: user.email ?? null, p_kind: source, p_title: title, p_ids: ids, p_hash: hash,
                p_charge: charge ?? 'teacher', p_hwp: format === 'hwp', p_features: features, p_limit: limit,
                p_since: charge === 'exam' ? ps.examStart : null,
                p_receipt: body.receiptId,
            });
            if (error || !data) {
                if (error?.code === 'P0001')
                    await admin.storage.from('pdf-jobs').remove([`${id}.hml`]);
                if (error?.message?.includes('PLAN_LIMIT')) throw new BundleError('다른 요청에서 횟수를 사용했어요. 이용권을 확인한 뒤 다시 눌러 주세요.', 402, true);
                throw new BundleError('묶음 저장에 실패했어요. 잠시 후 다시 시도해 주세요.', 503);
            }
            job = data as BundleJob;
            if (job.id !== id) await admin.storage.from('pdf-jobs').remove([`${id}.hml`]);
        }
    }
    await assertBundleDelivery(user, job);
    if (job.kind === 'print' && job.plan_charge !== 'free' && (!job.retain_until || bundleExpired(job)))
        throw new BundleError(PLAN_COPY.expired, 410);
    if (format === 'hwp' && job.plan_charge === 'free') throw new BundleError('무료 체험은 PDF만 받을 수 있어요.', 402, true);
    if (format === 'pdf' && job.status === 'error' && (job.hwp_ready || job.pdf_delivered)) {
        await bundleHml(job, user);
        const { error } = await admin.from('pdf_jobs').update({ status: 'pending', error: null }).eq('id', job.id).eq('user_id', user.id).eq('status', 'error');
        if (error) throw new BundleError('PDF 재요청에 실패했어요.', 503);
    }
    return job;
}
