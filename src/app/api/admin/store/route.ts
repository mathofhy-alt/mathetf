import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/utils/admin-auth';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { sourceCounts, validateBook } from '@/lib/store/admin';
import { uuidPattern } from '@/lib/payments/order';

export const dynamic = 'force-dynamic';
export async function GET(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;
    try {
        const source = req.nextUrl.searchParams.get('source');
        if (source !== null) {
            if (!source.trim() || source.length > 500 || source.includes('|')) return NextResponse.json({ error: '문항 묶음을 확인해 주세요.' }, { status: 400 });
            return NextResponse.json(await sourceCounts(source.trim()));
        }
        const { data, error } = await createAdminClient().from('store_books').select('*').order('sort_order').order('created_at');
        if (error) throw new Error('책 목록을 불러오지 못했습니다. 20261108_store_books.sql 적용 여부를 확인해 주세요.');
        return NextResponse.json({ books: data });
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : '조회에 실패했습니다.' }, { status: 503 }); }
}
export async function POST(req: NextRequest) {
    const auth = await requireAdmin();
    if (!auth.authorized) return auth.response;
    try {
        const input = await req.json();
        const book = validateBook(input);
        if (input.id && (typeof input.id !== 'string' || !uuidPattern.test(input.id))) throw new Error('책 ID를 확인해 주세요.');
        const counts = book.source_db_id ? await sourceCounts(book.source_db_id) : { private: 0, nonPrivate: 0, sorted: 0 };
        if (counts.sorted) throw new Error(`공개(sorted) 문항이 ${counts.sorted}개 있습니다. 연결 문항의 공개 상태를 해제한 뒤 저장해 주세요.`);
        if (book.published && book.source_db_id && !counts.private) throw new Error('연결된 private 문항이 있어야 공개할 수 있습니다.');
        const sb = createAdminClient();
        const { data, error } = input.id ? await sb.from('store_books').update(book).eq('id', input.id).select().single() : await sb.from('store_books').insert(book).select().single();
        if (error) throw new Error(error.code === '23505' ? '이미 사용 중인 주소 또는 문항 묶음입니다.' : '저장하지 못했습니다. 다른 책·시중교재·공개 자료와 묶음이 겹치는지, 주문이 있는 책의 묶음을 변경했는지 확인해 주세요.');
        return NextResponse.json({ book: data, counts });
    } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : '입력 내용을 확인해 주세요.' }, { status: 400 }); }
}
