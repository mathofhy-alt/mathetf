import { PLAN_COPY } from '@/lib/qbPassConfig';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { bundleExpired } from '@/lib/bundlePolicy';
import { prepareBundle, bundleHml, logBundleDownload, BundleError, type BundleJob } from '@/lib/planBundles';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 프린트 유료 묶음은 PDF와 한글이 같은 작업·차감 기록을 공유한다. */
export async function POST(req: NextRequest) {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    let job: BundleJob | undefined;
    try {
        const body = await req.json().catch(() => ({}));
        job = await prepareBundle(user, body, 'hwp');
        const hml = await bundleHml(job, user);
        if (bundleExpired(job)) throw new BundleError(PLAN_COPY.expired, 410);
        // 파일 생성·보관이 모두 끝난 뒤에만 제공을 확정한다. 실패·환급과 같은 잠금으로 경쟁한다.
        const { data, error } = await createAdminClient().rpc('claim_bundle_hwp', { p_user: user.id, p_id: job.id });
        if (error || !data) throw new BundleError('묶음 상태가 바뀌었어요. 이용 현황을 확인한 뒤 다시 받아 주세요.', 409);
        job = data as BundleJob;
        await logBundleDownload(user, job, 'hwp');
        const title = (job.title || '문제').replace(/[\\/<>:"|?*]/g, '_').trim() || '문제';
        return new NextResponse(hml, {
            headers: {
                'Content-Type': 'application/x-hwp; charset=utf-8',
                'Content-Disposition': `attachment; filename="questions.hml"; filename*=UTF-8''${encodeURIComponent(title + '.hml')}`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (e: any) {
        if (job) await createAdminClient().rpc('fail_bundle_hwp', { p_user: user.id, p_id: job.id });
        return NextResponse.json({ error: e.message || '한글 요청 실패', needPass: e instanceof BundleError && e.needPass }, { status: e instanceof BundleError ? e.status : 503 });
    }
}
