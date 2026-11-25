import { NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { recordWithdrawnPhone } from '@/lib/withdraw';

export const dynamic = 'force-dynamic';

/**
 * [2026-11-25] 회원 탈퇴(대표 지시: 탈퇴 후 7일간 같은 번호 재가입 금지).
 * 1) 로그인한 본인 + 현재 비밀번호 재확인(자리 비운 화면에서 남이 누르지 못하게)
 * 2) 번호 해시를 withdrawn_phones 에 남김(7일 재가입 차단)
 * 3) withdraw_account(): 개인 이용 기록 삭제, 제보 자료는 올린 사람만 지움
 * 4) 거래 기록이 없으면 계정 삭제, 있으면(결제·포인트 등 법정 보관) 계정의 개인정보를 지우고 로그인 차단
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
    try {
        const phone = String(user.user_metadata?.phone || user.phone || '');
        await recordWithdrawnPhone(admin, phone);
        const { data: mode, error: rpcError } = await admin.rpc('withdraw_account', { p_uid: uid });
        if (rpcError) throw rpcError;
        if (mode === 'delete') {
            const { error } = await admin.auth.admin.deleteUser(uid);
            if (error) throw error;
        } else {
            // 거래 기록이 남는 회원: 로그인 정보·연락처를 지우고 계정을 막는다
            const { error } = await admin.auth.admin.updateUserById(uid, {
                email: `withdrawn+${uid}@deleted.mathetf.com`,
                phone: '',
                // user_metadata 는 덮어쓰기가 아니라 합치기라, 기존 칸(이름·번호·동의·유입 등)을 하나하나 null 로 비운다(11/25 시험에서 확인)
                user_metadata: { ...Object.fromEntries(Object.keys(user.user_metadata || {}).map(k => [k, null])), withdrawn_at: new Date().toISOString() },
                ban_duration: '876000h',
                password: crypto.randomUUID() + crypto.randomUUID(),
            } as any);
            if (error) throw error;
        }
        await supabase.auth.signOut().catch(() => {});
        return NextResponse.json({ ok: true, mode });
    } catch (e: any) {
        console.error('[withdraw] 실패', uid, e?.message || e);
        return NextResponse.json({ ok: false, message: '탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도하거나 건의사항으로 알려 주세요.' }, { status: 500 });
    }
}
