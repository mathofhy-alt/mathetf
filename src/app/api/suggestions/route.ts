import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { hashPassword } from '@/lib/suggestion-password';

export const dynamic = 'force-dynamic';

// 건의사항은 비밀글(비밀번호·본문)이라 클라이언트 직접 조회 대신 서버 경유로만 제공.
// (RLS로 테이블 잠금 후에도 이 라우트는 service role이라 동작)

// GET /api/suggestions — 목록 (안전한 필드만)
export async function GET() {
    try {
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('suggestions')
            .select('id, title, created_at, views, author_id, author_nickname')
            .order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ items: data || [] });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST /api/suggestions — 작성 (로그인 필수, 비밀번호는 해시로 저장)
export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

        const { title, content, password } = await req.json();
        if (!title?.trim() || !content?.trim() || !password?.trim()) {
            return NextResponse.json({ error: '제목, 내용, 비밀번호를 모두 입력해주세요.' }, { status: 400 });
        }

        const admin = createAdminClient();
        const { error } = await admin.from('suggestions').insert({
            title: title.trim(),
            content,
            password: hashPassword(password),
            author_id: user.id,
            author_nickname: user.user_metadata?.full_name || user.email?.split('@')[0],
        });
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
