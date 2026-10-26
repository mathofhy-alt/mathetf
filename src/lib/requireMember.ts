import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * [10/26 대표] 문항 내용(검색 결과·문제 그림·문제 글)은 로그인한 회원에게만 준다.
 * 10/25 로봇이 비로그인으로 시험지 만들기를 하루 600번 열어 문제 그림을 받아 갔다 — "비로그인은 아무것도 못 하게".
 * 로그인 안 했으면 401 응답을, 했으면 null 을 돌려준다.
 */
export async function memberOnly(): Promise<NextResponse | null> {
    try {
        const { data: { user } } = await createClient().auth.getUser();
        if (user) return null;
    } catch { /* 세션 확인 실패도 비로그인으로 본다 */ }
    return NextResponse.json({ success: false, error: '로그인이 필요합니다.' }, { status: 401 });
}
