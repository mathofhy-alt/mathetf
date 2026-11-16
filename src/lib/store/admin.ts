import 'server-only';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { subPattern } from '@/lib/questions/privateDb';
import type { AdminStoreBook } from './types';

export async function sourceCounts(source: string) {
    const sb = createAdminClient();
    const results = await Promise.all([
        sb.from('questions').select('id', { count: 'exact', head: true }).eq('source_db_id', source).eq('work_status', 'private'),
        sb.from('questions').select('id', { count: 'exact', head: true }).like('source_db_id', subPattern(source)).eq('work_status', 'private'),
        sb.from('questions').select('id', { count: 'exact', head: true }).eq('source_db_id', source).or('work_status.is.null,work_status.neq.private'),
        sb.from('questions').select('id', { count: 'exact', head: true }).like('source_db_id', subPattern(source)).or('work_status.is.null,work_status.neq.private'),
        sb.from('questions').select('id', { count: 'exact', head: true }).eq('source_db_id', source).eq('work_status', 'sorted'),
        sb.from('questions').select('id', { count: 'exact', head: true }).like('source_db_id', subPattern(source)).eq('work_status', 'sorted'),
    ]);
    if (results.some(r => r.error)) throw new Error('문항 수를 확인하지 못했습니다.');
    return { private: (results[0].count || 0) + (results[1].count || 0), nonPrivate: (results[2].count || 0) + (results[3].count || 0), sorted: (results[4].count || 0) + (results[5].count || 0) };
}

export function validateBook(input: Record<string, unknown>) {
    const str = (key: string, max = 200) => {
        const value = input[key] ?? '';
        if (typeof value !== 'string' || value.length > max) throw new Error(`${key} 입력을 확인해 주세요.`);
        return value.trim();
    };
    const slug = str('slug', 120), title = str('title'), source = str('source_db_id', 500) || null, pdf = str('pdf_path', 200) || null;
    // [11/17] PDF 책은 문항 묶음 없이 판매용 PDF(비공개 exam-materials 버킷 store/pdf/…)만 둔다
    if (pdf && !/^store\/pdf\/[a-z0-9]+(-[a-z0-9]+)*\.pdf$/.test(pdf)) throw new Error('PDF 경로는 store/pdf/영문소문자-숫자.pdf 형식입니다.');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || !title || (!source && !pdf) || source?.includes('|')) throw new Error('주소는 영문 소문자·숫자·하이픈으로 입력하고, 책 제목과 문항 묶음 또는 PDF 경로를 입력해 주세요.');
    const price = input.price === '' || input.price === null ? null : input.price;
    if (price !== null && (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 0 || price > 2147483647)) throw new Error('가격은 빈칸 또는 0 이상의 정수로 입력해 주세요.');
    const order = input.sort_order ?? 0;
    if (typeof order !== 'number' || !Number.isInteger(order) || Math.abs(order) > 2147483647) throw new Error('정렬 순서를 확인해 주세요.');
    const color = str('cover_text_color', 7);
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('표지 글자색을 확인해 주세요.');
    const contents = input.contents;
    if (!contents || typeof contents !== 'object' || Array.isArray(contents) || Object.keys(contents).length > 30
        || Object.entries(contents).some(([k, v]) => k.length > 80 || !['string', 'number'].includes(typeof v) || String(v).length > 200 || (typeof v === 'number' && !Number.isFinite(v)))) throw new Error('구성은 짧은 이름과 글자·숫자로 된 JSON 객체로 입력해 주세요.');
    const cover = str('cover_path', 250) || null;
    const samples = input.sample_paths ?? [];
    const asset = (p: unknown, kind: string) => typeof p === 'string' && new RegExp(`^store/${kind}/[a-f0-9-]+\\.(png|jpg|webp)$`).test(p);
    if ((cover && !asset(cover, 'covers')) || !Array.isArray(samples) || samples.length > 8 || samples.some(p => !asset(p, 'samples'))) throw new Error('이미지는 이 화면의 업로드 기능으로 등록해 주세요.');
    if (typeof input.published !== 'boolean') throw new Error('공개 여부를 확인해 주세요.');
    return { slug, title, series: str('series'), subtitle: str('subtitle', 500), grade: str('grade', 60) || null, subject: str('subject', 60) || null,
        description: str('description', 20000), contents: contents as AdminStoreBook['contents'], contents_description: str('contents_description', 20000), usage_notes: str('usage_notes', 10000),
        source_db_id: source, pdf_path: pdf, cover_path: cover, cover_text_color: color, sample_paths: samples as string[], price, sort_order: order, published: input.published };
}
