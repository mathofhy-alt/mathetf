import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 서버에서만 사용하는 Supabase Service Role Key (관리자 권한)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        let { phone, code } = body;

        if (!phone || !code) {
            return NextResponse.json({ success: false, message: '휴대폰 번호와 인증코드가 필요합니다.' }, { status: 400 });
        }

        // 숫자만 추출
        phone = phone.replace(/[^0-9]/g, '');

        // 데이터베이스에서 해당 번호의 가장 최신 인증 정보 조회
        const { data, error } = await supabaseAdmin
            .from('phone_verifications')
            .select('*')
            .eq('phone_number', phone)
            .single();

        if (error || !data) {
            // 번호가 DB에 없거나 에러 발생
            return NextResponse.json({ success: false, message: '인증 번호 요청 내역이 없습니다. 다시 발송해주세요.' }, { status: 400 });
        }

        // 1. 이미 인증된 경우 방어
        if (data.is_verified) {
            return NextResponse.json({ success: true, message: '이미 인증 완료된 번호입니다.' });
        }

        // 2. 만료 시간 체크
        const now = new Date();
        const expiresAt = new Date(data.expires_at);
        if (now > expiresAt) {
            return NextResponse.json({ success: false, message: '인증 시간이 초과되었습니다. 인증 번호를 다시 발송해주세요.' }, { status: 400 });
        }

        // 3. 인증 번호 불일치 체크
        if (data.otp_code !== code) {
            return NextResponse.json({ success: false, message: '인증 번호가 일치하지 않습니다.' }, { status: 400 });
        }

        // 4. 인증 통과 -> DB 업데이트
        const { error: updateError } = await supabaseAdmin
            .from('phone_verifications')
            .update({ is_verified: true })
            .eq('id', data.id);

        if (updateError) {
            return NextResponse.json({ success: false, message: '인증 완료 처리 중 데이터베이스 오류가 발생했습니다.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: '휴대폰 인증이 완료되었습니다.' });

    } catch (error: any) {
        console.error('Verify SMS Route Error:', error);
        return NextResponse.json({ success: false, message: '서버 오류가 발생했습니다.' }, { status: 500 });
    }
}
