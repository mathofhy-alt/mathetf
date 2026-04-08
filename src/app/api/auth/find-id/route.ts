import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 서버에서만 사용하는 Supabase Service Role Key (관리자 권한)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

function maskEmail(email: string) {
    if (!email || !email.includes('@')) return email;
    const [localPart, domain] = email.split('@');
    if (localPart.length <= 3) {
        return `${localPart.charAt(0)}***@${domain}`;
    }
    const maskedLocal = localPart.substring(0, 3) + '*'.repeat(localPart.length - 3);
    return `${maskedLocal}@${domain}`;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        let { phone } = body;

        if (!phone) {
            return NextResponse.json({ success: false, message: '휴대폰 번호가 필요합니다.' }, { status: 400 });
        }

        // 숫자만 추출
        phone = phone.replace(/[^0-9]/g, '');

        // 1. 휴대폰 본인 인증 여부 확인
        const { data: verificationData, error: verificationError } = await supabaseAdmin
            .from('phone_verifications')
            .select('is_verified')
            .eq('phone_number', phone)
            .single();

        if (verificationError || !verificationData || !verificationData.is_verified) {
            return NextResponse.json({ success: false, message: '휴대폰 본인 인증이 완료되지 않았거나 유효하지 않습니다.' }, { status: 400 });
        }

        // 2. 관리자 권한으로 전체 유저 목록 조회 (실무에서는 RPC 함수로 phone을 인덱싱하여 검색하는 것이 효율적입니다)
        const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

        if (usersError) {
            console.error('List Users Error:', usersError);
            return NextResponse.json({ success: false, message: '회원 정보를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
        }

        // 3. raw_user_meta_data 내의 phone 필드와 일치하는 계정 찾기
        const matchedUsers = usersData.users.filter(user => user.user_metadata?.phone === phone);

        if (matchedUsers.length === 0) {
            return NextResponse.json({ success: true, emails: [] });
        }

        // 4. 이메일 추출 및 마스킹 처리
        const emails = matchedUsers
            .filter(user => user.email)
            .map(user => maskEmail(user.email!));

        return NextResponse.json({ success: true, emails });

    } catch (error: any) {
        console.error('Find ID Route Error:', error);
        return NextResponse.json({ success: false, message: '서버 오류가 발생했습니다.' }, { status: 500 });
    }
}
