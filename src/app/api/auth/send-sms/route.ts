import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SolapiMessageService } from 'solapi';

// 서버에서만 사용하는 Supabase Service Role Key (관리자 권한)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Solapi SMS Service
const solapiApiKey = process.env.SOLAPI_API_KEY || 'dummy_api_key';
const solapiApiSecret = process.env.SOLAPI_API_SECRET || 'dummy_api_secret';
const senderNumber = process.env.SOLAPI_SENDER_NUMBER || '07079544146';
const messageService = new SolapiMessageService(solapiApiKey, solapiApiSecret);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        let { phone } = body;

        if (!phone) {
            return NextResponse.json({ success: false, message: '휴대폰 번호가 필요합니다.' }, { status: 400 });
        }

        // 숫자만 추출 (예: 010-1234-5678 -> 01012345678)
        phone = phone.replace(/[^0-9]/g, '');

        if (phone.length < 10) {
            return NextResponse.json({ success: false, message: '올바른 휴대폰 번호를 입력해주세요.' }, { status: 400 });
        }

        // 6자리 난수 생성
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

        // 3분(180초) 뒤 만료 
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 3);

        // Supabase phone_verifications 테이블에 Upsert (기존 번호가 있으면 업데이트)
        const { error: dbError } = await supabaseAdmin
            .from('phone_verifications')
            .upsert(
                {
                    phone_number: phone,
                    otp_code: otpCode,
                    expires_at: expiresAt.toISOString(),
                    is_verified: false,
                },
                { onConflict: 'phone_number' }
            );

        if (dbError) {
            console.error('Database Error:', dbError);
            return NextResponse.json({ success: false, message: '데이터베이스 오류가 발생했습니다.' }, { status: 500 });
        }

        // SMS 발송 로직
        // 테스트 환경이거나 키가 더미일 경우 실제로 발송하지 않고 성공으로 처리 (디버깅 용이성)
        if (solapiApiKey === 'dummy_api_key' || process.env.NODE_ENV === 'development') {
            console.log(`[개발 모드 SMS 알림] 수신자: ${phone}, 인증번호: ${otpCode}`);
        } else {
            try {
                await messageService.send({
                    to: phone,
                    from: senderNumber, // 발신번호 (CoolSMS 사전에 등록된 번호여야 함)
                    text: `[수학ETF] 휴대전화 인증번호는 [${otpCode}] 입니다. 정확히 입력해주세요.`,
                });
            } catch (smsError: any) {
                console.error('SMS 전송 실패:', smsError);
                return NextResponse.json({ success: false, message: '문자 발송에 실패했습니다. 발신자 번호나 API 설정을 확인해주세요.' }, { status: 500 });
            }
        }

        return NextResponse.json({
            success: true,
            message: '인증번호가 발송되었습니다.',
            // HINT: 개발/테스트 편의를 위해 만약 진짜 꿀팁이 필요하다면 응답에 내려줄수도 있지만 보안상 생략합니다.
            // 개발 모드에서만 코드 노출 (로컬 개발 편의용)
            __dev_otp: process.env.NODE_ENV === 'development' ? otpCode : undefined
        });

    } catch (error: any) {
        console.error('Route Error:', error);
        return NextResponse.json({ success: false, message: '서버 오류가 발생했습니다.' }, { status: 500 });
    }
}
