import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { recordWithdrawnPhone } from '@/lib/withdraw';

export const dynamic = 'force-dynamic';

/**
 * [2026-11-25] 회원 탈퇴(대표 지시: 탈퇴 후 7일간 같은 번호 재가입 금지). 11/25 배포 전 검토 반영.
 * 1) 로그인한 본인 + 현재 비밀번호 재확인
 * 2) 충전 포인트가 남아 있으면 막는다(약관상 소멸 대상은 적립 포인트뿐 — 사용·환불 안내)
 * 3) 번호는 HMAC 값으로만 7일 기록 + 가입 인증 기록의 원번호 삭제
 * 4) withdraw_account(): 한 트랜잭션 — 거래 기록 없으면 계정까지 삭제, 있으면 기록은 남기고 개인정보만 비움
 * 5) 익명 처리면 계정 이메일·메타데이터를 지우고 로그인 차단 / 저장소 파일(저장 시험지·PDF·개인DB 요청 첨부) 삭제
 */
export async function POST(req: Request) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ ok: false, message: '로그인 후 이용해 주세요.' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== '탈퇴') return NextResponse.json({ ok: false, message: '확인 칸에 「탈퇴」를 입력해 주세요.' }, { status: 400 });
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password) return NextResponse.json({ ok: false, message: '현재 비밀번호를 입력해 주세요.' }, { status: 400 });

    // 비밀번호 확인은 세션을 남기지 않는 별도 클라이언트로
    const probe = createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: pwError } = await probe.auth.signInWithPassword({ email: user.email, password });
    if (pwError) return NextResponse.json({ ok: false, message: '현재 비밀번호가 맞지 않아요.' }, { status: 403 });

    const admin = createAdminClient();
    const uid = user.id;
    const { data: prof } = await admin.from('profiles').select('purchased_points').eq('id', uid).maybeSingle();
    if ((prof?.purchased_points ?? 0) > 0)
        return NextResponse.json({ ok: false, message: `충전한 포인트 ${Number(prof!.purchased_points).toLocaleString()}점이 남아 있어요. 사용하시거나 건의사항으로 환불을 요청하신 뒤 탈퇴해 주세요.` }, { status: 409 });

    try {
        await recordWithdrawnPhone(admin, String(user.user_metadata?.phone || user.phone || ''));
        const { data: res, error: rpcError } = await admin.rpc('withdraw_account', { p_uid: uid });
        if (rpcError) throw rpcError;
        const mode: string = res?.mode;
        if (mode === 'anonymize') {
            // 거래 기록이 남는 회원: 로그인 정보·연락처를 지우고 계정을 막는다(실패하면 두 번 더 시도)
            const patch: any = {
                email: `withdrawn+${uid}@deleted.mathetf.com`,
                // user_metadata 는 덮어쓰기가 아니라 합치기라, 기존 칸(이름·번호·동의·유입 등)을 하나하나 null 로 비운다
                user_metadata: { ...Object.fromEntries(Object.keys(user.user_metadata || {}).map(k => [k, null])), withdrawn: true },
                ban_duration: '876000h',
                password: randomBytes(32).toString('base64url'),
            };
            let lastErr: any = null;
            for (let i = 0; i < 3; i++) {
                const { error } = await admin.auth.admin.updateUserById(uid, patch);
                if (!error) { lastErr = null; break; }
                lastErr = error;
            }
            if (lastErr) throw lastErr;
        } else if (mode !== 'deleted') {
            throw new Error('withdraw_account 결과를 알 수 없음');
        }
        // 저장소 파일 — 실패해도 탈퇴는 끝난 것으로 보고 서버 기록에 남긴다
        const objs: { bucket: string; name: string }[] = Array.isArray(res?.objects) ? res.objects : [];
        const byBucket = new Map<string, string[]>();
        for (const o of objs) byBucket.set(o.bucket, [...(byBucket.get(o.bucket) || []), o.name]);
        for (const [bucket, names] of byBucket) {
            for (let i = 0; i < names.length; i += 100) {
                const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
                if (error) console.error('[withdraw] 파일 삭제 실패', uid, bucket, error.message);
            }
        }
        await supabase.auth.signOut().catch(() => {});
        return NextResponse.json({ ok: true, mode });
    } catch (e: any) {
        console.error('[withdraw] 실패', uid, e?.message || e);
        return NextResponse.json({ ok: false, message: '탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도하거나 건의사항으로 알려 주세요.' }, { status: 500 });
    }
}
