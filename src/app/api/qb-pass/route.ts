import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { passStatus } from '@/lib/qbPass';
export const dynamic = 'force-dynamic';
// 시험지 만들기 이용권 상태 — 남은 무료 횟수·이용권 기간 (10/7)
export async function GET() {
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ loggedIn: false });
    try { return NextResponse.json({ loggedIn: true, ...await passStatus(user) }); }
    catch { return NextResponse.json({ loggedIn: true, error: '이용 현황을 불러오지 못했습니다.' }, { status: 503 }); }
}
