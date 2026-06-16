import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 서버에서만 사용하는 Service Role Key (관리자 권한). 절대 클라이언트로 나가면 안 됨.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * 회원가입 (휴대폰 인증 강제).
 * - 기존엔 클라이언트가 supabase.auth.signUp 을 직접 호출 → 전화인증을 우회해도 가입됐음(취약).
 * - 이제 서버에서 phone_verifications.is_verified=true 를 확인한 뒤에만 admin 권한으로 계정 생성.
 * - 가입에 사용된 인증기록은 삭제(1인증=1가입, 재사용 차단).
 * ⚠️ Supabase 대시보드에서 "Allow new users to sign up"을 꺼야 anon signUp 우회까지 완전 차단됨.
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        let { email, password, phone, full_name, marketing_agreed, postcode, address, address_detail } = body;

        // 1. 입력 검증
        if (!email || !password || !phone || !full_name) {
            return NextResponse.json({ success: false, message: '필수 정보를 모두 입력해주세요.' }, { status: 400 });
        }
        if (typeof password !== 'string' || password.length < 6) {
            return NextResponse.json({ success: false, message: '비밀번호는 6자리 이상이어야 합니다.' }, { status: 400 });
        }
        if (!postcode || !address || !address_detail) {
            return NextResponse.json({ success: false, message: '주소를 정확히 입력해주세요.' }, { status: 400 });
        }
        phone = String(phone).replace(/[^0-9]/g, '');

        // 2. [핵심] 서버에서 휴대폰 인증 여부 확인 — 인증 안 된 번호면 가입 불가
        const { data: pv } = await supabaseAdmin
            .from('phone_verifications')
            .select('id, is_verified')
            .eq('phone_number', phone)
            .maybeSingle();

        if (!pv || !pv.is_verified) {
            return NextResponse.json({ success: false, message: '휴대폰 본인 인증을 먼저 완료해주세요.' }, { status: 403 });
        }

        // 3. 관리자 권한으로 계정 생성 (이메일 인증 절차 없이 즉시 활성)
        const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name,
                marketing_agreed: !!marketing_agreed,
                phone,
                phone_verified: true,
                postcode,
                address,
                address_detail,
            },
        });

        if (createError) {
            const msg = /already|exist|registered/i.test(createError.message)
                ? '이미 가입된 이메일입니다.'
                : (createError.message || '회원가입 처리 중 오류가 발생했습니다.');
            return NextResponse.json({ success: false, message: msg }, { status: 400 });
        }

        // 4. 사용된 인증기록 소비(삭제) — 같은 인증으로 추가 가입 못 하게
        await supabaseAdmin.from('phone_verifications').delete().eq('id', pv.id);

        return NextResponse.json({ success: true, userId: created.user?.id });
    } catch (error: any) {
        console.error('Signup Route Error:', error);
        return NextResponse.json({ success: false, message: '서버 오류가 발생했습니다.' }, { status: 500 });
    }
}
