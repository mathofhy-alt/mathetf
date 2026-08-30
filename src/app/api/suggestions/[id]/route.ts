import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'mathofhy@naver.com';

// GET /api/suggestions/[id] — 메타만 반환. 작성자/관리자면 본문 포함(unlocked).
// 비밀번호·본문은 그 외엔 절대 내려가지 않음 (해제는 /verify 로만).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const admin = createAdminClient();
        const COLS = 'id, title, content, created_at, views, author_id, author_nickname';
        // admin_reply 는 나중에 추가된 컬럼이다. 마이그레이션 전에 배포돼도 페이지가 죽지 않게
        // 컬럼이 없으면 그것만 빼고 다시 읽는다(배포 순서에 안 걸리게).
        let { data: post, error } = await admin
            .from('suggestions')
            .select(`${COLS}, admin_reply, admin_replied_at`)
            .eq('id', params.id)
            .single();
        if (error) {
            ({ data: post, error } = await admin
                .from('suggestions').select(COLS).eq('id', params.id).single());
        }
        if (error || !post) return NextResponse.json({ error: 'not found' }, { status: 404 });

        // 조회수 증가 (서버에서)
        await admin.from('suggestions').update({ views: (post.views || 0) + 1 }).eq('id', params.id);

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const unlocked = !!user && (user.email === ADMIN_EMAIL || user.id === post.author_id);

        // 답변도 본문과 같은 취급 — 비밀글이므로 잠긴 사람에겐 안 내려간다.
        const { content, admin_reply, admin_replied_at, ...meta } = post as typeof post & {
            admin_reply?: string | null; admin_replied_at?: string | null;
        };
        return NextResponse.json({
            post: unlocked ? { ...meta, content, admin_reply, admin_replied_at } : meta,
            unlocked,
            isOwner: unlocked,
            isAdmin: !!user && user.email === ADMIN_EMAIL,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// DELETE /api/suggestions/[id] — 작성자/관리자만
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
    try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

        const admin = createAdminClient();
        const { data: post } = await admin.from('suggestions').select('author_id').eq('id', params.id).single();
        if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });
        if (user.email !== ADMIN_EMAIL && user.id !== post.author_id) {
            return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
        }

        const { error } = await admin.from('suggestions').delete().eq('id', params.id);
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
