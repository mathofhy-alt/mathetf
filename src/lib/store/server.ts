import 'server-only';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { storeEnabled, STORE_ITEM_TYPE } from './config';
import { PUBLIC_BOOK_FIELDS, type StoreBook } from './types';

// pdf_path 는 비공개 버킷 경로 — 화면에는 PDF 책인지만 넘긴다.
const FIELDS = PUBLIC_BOOK_FIELDS + ',pdf_path';
const toBook = (row: any): StoreBook => { const { pdf_path, ...rest } = row; return { ...rest, pdf: !!pdf_path } as StoreBook; };

export async function storeViewer() {
    const { data: { user } } = await createClient().auth.getUser();
    const admin = user?.email === 'mathofhy@naver.com';
    return { user, admin, allowed: storeEnabled() || admin };
}

// Never expose source_db_id or query question/image tables on a public store page.
export async function storeBooks(admin = false): Promise<StoreBook[]> {
    const books: StoreBook[] = [];
    const sb = createAdminClient();
    for (let from = 0; ; from += 1000) {
        let query = sb.from('store_books').select(FIELDS).order('sort_order').order('created_at').order('id').range(from, from + 999);
        if (!admin) query = query.eq('published', true);
        const { data, error } = await query;
        if (error) throw new Error('서점 정보를 불러오지 못했습니다. 마이그레이션 적용 여부를 확인해 주세요.');
        books.push(...(data || []).map(toBook));
        if (!data || data.length < 1000) return books;
    }
}

// A withdrawn book stays accessible to its buyers, while remaining absent from the public listing.
export async function storeBookBySlug(slug: string, admin: boolean, purchased: string[]): Promise<StoreBook | null> {
    const { data: row, error } = await createAdminClient().from('store_books').select(FIELDS).eq('slug', slug).maybeSingle();
    const data = row as any;
    if (error) throw new Error('책 정보를 불러오지 못했습니다.');
    if (!data || (!admin && !data.published && !purchased.includes(data.id))) return null;
    return toBook(data);
}

export async function purchasedBookIds(userId?: string): Promise<string[]> {
    if (!userId) return [];
    const { data, error } = await createAdminClient().from('purchased_items').select('item_id')
        .eq('user_id', userId).eq('item_type', STORE_ITEM_TYPE);
    if (error) throw new Error('구매한 책을 확인하지 못했습니다.');
    return (data || []).map(row => row.item_id);
}

// Covers and deliberately uploaded marketing samples only, in the existing hwpx bucket.
export function storeImageUrl(path: string) {
    return createAdminClient().storage.from('hwpx').getPublicUrl(path).data.publicUrl;
}
export function withStoreImages(book: StoreBook) {
    return { ...book, cover_path: book.cover_path ? storeImageUrl(book.cover_path) : null,
        sample_paths: book.sample_paths.map(storeImageUrl),
        examples: (book.examples || []).map(e => ({ ...e, original: storeImageUrl(e.original), variant: storeImageUrl(e.variant) })) };
}
