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

// [보안] IP 속도제한 (계정 열거/스팸 방지). best-effort.
const ipHits: Map<string, { count: number; resetAt: number }> = (globalThis as any).__findid_hits || new Map();
(globalThis as any).__findid_hits = ipHits;
function ipRateLimited(ip: string): boolean {
    const now = Date.now();
    const rec = ipHits.get(ip);
    if (!rec || now > rec.resetAt) { ipHits.set(ip, { count: 1, resetAt: now + 60_000 }); return false; }
    rec.count++;
    return rec.count > 10;
}

export async function POST(req: Request) {
    try {
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
        if (ipRateLimited(ip)) {
            return NextResponse.json({ success: false, message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });
        }

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

        // 2. 유저 목록 조회 — 페이지네이션으로 전체 커버 (이전엔 첫 페이지(50명)만 조회해
        //    그 이후 가입자는 아이디를 못 찾는 버그가 있었음).
        //    ※ 규모가 커지면 profiles.phone 인덱스 기반 조회로 전환 권장.
        const allUsers: any[] = [];
        const perPage = 1000;
        let page = 1;
        while (true) {
            const { data: usersData, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
            if (usersError) {
                console.error('List Users Error:', usersError);
                return NextResponse.json({ success: false, message: '회원 정보를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
            }
            allUsers.push(...usersData.users);
            if (usersData.users.length < perPage) break;
            page++;
        }

        // 3. raw_user_meta_data 내의 phone 필드와 일치하는 계정 찾기
        const matchedUsers = allUsers.filter(user => user.user_metadata?.phone === phone);

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
