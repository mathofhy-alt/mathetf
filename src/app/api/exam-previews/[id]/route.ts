import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { uuidPattern } from '@/lib/payments/order';
export const dynamic = 'force-dynamic';

// [10/7] 시험지 미리보기 2쪽부터는 회원만(사용자 결정). 시험지 페이지 HTML 에는 1쪽 주소만 들어가고,
//   나머지 쪽 주소는 로그인한 회원에게만 여기서 준다.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
    if (!uuidPattern.test(params.id)) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
    const { data: { user } } = await createClient().auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    const { data, error } = await createAdminClient().from('exam_materials').select('preview_urls, content_type').eq('id', params.id).maybeSingle();
    if (error) return NextResponse.json({ error: '미리보기를 불러오지 못했습니다.' }, { status: 503 });
    if (!data || data.content_type === '원본제보') return NextResponse.json({ error: '없는 시험지입니다.' }, { status: 404 });
    return NextResponse.json({ urls: Array.isArray(data.preview_urls) ? data.preview_urls : [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
