import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { verifyPassword, isLegacyPlaintext, hashPassword } from '@/lib/suggestion-password';

export const dynamic = 'force-dynamic';

// POST /api/suggestions/[id]/verify — 비밀번호 서버 검증 후에만 본문 반환
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const { password } = await req.json();
        if (!password) return NextResponse.json({ error: '비밀번호를 입력해주세요.' }, { status: 400 });

        const admin = createAdminClient();
        const { data: post, error } = await admin
            .from('suggestions')
            .select('id, title, content, password, created_at, views, author_id, author_nickname')
            .eq('id', params.id)
            .single();
        if (error || !post) return NextResponse.json({ error: 'not found' }, { status: 404 });

        if (!verifyPassword(password, post.password)) {
            // 무차별 대입 완화용 지연
            await new Promise((r) => setTimeout(r, 400));
            return NextResponse.json({ error: '비밀번호가 일치하지 않습니다.' }, { status: 403 });
        }

        // 레거시 평문 행은 성공 시 해시로 업그레이드
        if (isLegacyPlaintext(post.password)) {
            await admin.from('suggestions').update({ password: hashPassword(password) }).eq('id', params.id);
        }

        const { password: _pw, ...safe } = post;
        return NextResponse.json({ post: safe });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
