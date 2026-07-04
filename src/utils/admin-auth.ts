import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function requireAdmin() {
    const supabase = await createClient();

    let { data: { user }, error } = await supabase.auth.getUser();

    // 토큰 갱신 레이스·순간 네트워크 오류로 인한 일시 실패는 1회 재시도
    // (장시간 관리자 세션에서 '소팅 실패'가 간헐적으로 뜨던 원인)
    if (error) {
        await new Promise((r) => setTimeout(r, 300));
        ({ data: { user }, error } = await supabase.auth.getUser());
    }

    if (error || !user) {
        return { authorized: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    if (user.email !== 'mathofhy@naver.com') {
        return { authorized: false, response: NextResponse.json({ error: 'Forbidden: Admin access only' }, { status: 403 }) };
    }

    return { authorized: true, user };
}
