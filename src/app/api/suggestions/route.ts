import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { hashPassword } from '@/lib/suggestion-password';

export const dynamic = 'force-dynamic';

// 건의사항은 비밀글(비밀번호·본문)이라 클라이언트 직접 조회 대신 서버 경유로만 제공.
// (RLS로 테이블 잠금 후에도 이 라우트는 service role이라 동작)

// GET /api/suggestions — 목록 (안전한 필드만)
const ADMIN_EMAIL = 'mathofhy@naver.com';
const HIDDEN_TITLE = '비밀글입니다';

export async function GET() {
    try {
        const admin = createAdminClient();
        // [10/24 대표] 제목도 비밀 — 「불법 아닌가요?」 같은 제목이 목록에 그대로 보였다. 작성자·관리자에게만 제목을 준다.
        const { data: { user } } = await createClient().auth.getUser();
        const isAdmin = !!user && user.email === ADMIN_EMAIL;
        // [10/24 대표] 목록은 공개하지 않는다 — 관리자는 전부, 회원은 자기가 쓴 것만, 로그인 안 하면 빈 목록. 답변은 마이페이지에서 본다.
        if (!user) return NextResponse.json({ items: [] });
        let q = admin.from('suggestions')
            .select('id, title, created_at, views, author_id, author_nickname, admin_replied_at')
            .order('created_at', { ascending: false });
        if (!isAdmin) q = q.eq('author_id', user.id);
        const { data, error } = await q;
        if (error) throw error;
        // [10/24 대표] 답변을 달아도 목록에서는 표시가 없었다 — 답변 내용은 비밀글이라 빼고 '답변 완료' 여부만 준다
        return NextResponse.json({ items: (data || []).map(({ admin_replied_at, ...r }: any) => ({
            ...r, title: isAdmin || (user && user.id === r.author_id) ? r.title : HIDDEN_TITLE, answered: !!admin_replied_at })) });
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
        // [10/24] 운영자에게만 보이는 의견이 되어 글 비밀번호는 받지 않는다(옛 글의 비밀번호 열람은 그대로 동작)
        if (!title?.trim() || !content?.trim()) {
            return NextResponse.json({ error: '제목과 내용을 입력해주세요.' }, { status: 400 });
        }

        const admin = createAdminClient();
        const { error } = await admin.from('suggestions').insert({
            title: title.trim(),
            content,
            password: hashPassword(password?.trim() || crypto.randomUUID()),
            author_id: user.id,
            author_nickname: user.user_metadata?.full_name || user.email?.split('@')[0],
        });
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
