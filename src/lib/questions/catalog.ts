import { createAdminClient } from '@/utils/supabase/server-admin';
import { createClient } from '@/utils/supabase/server';
import { isPersonalDbFree } from '@/lib/config';
import { unavailableDbs, type CatalogDb } from './scope';

export async function readAllPages<T>(makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await makeQuery(from, from + 999);
        if (error) throw new Error('자료 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
    }
}

export async function availableCatalog(): Promise<CatalogDb[]> {
    const sb = createAdminClient();
    const rows = await readAllPages<CatalogDb>((from, to) => sb.from('exam_materials')
        .select('id,title,school,grade,semester,exam_type,subject,file_type,exam_year,source_db_id,region,district')
        .eq('file_type', 'DB').order('id').range(from, to));
    let allowed = rows;
    if (!isPersonalDbFree()) {
        const { data: { user } } = await createClient().auth.getUser();
        if (user?.email !== 'mathofhy@naver.com') {
            const purchases = user ? await readAllPages<any>((from, to) => sb.from('purchases').select('id,exam_id').eq('user_id', user.id).order('id').range(from, to)) : [];
            const direct = user ? await readAllPages<any>((from, to) => sb.from('purchased_items').select('id,item_id').eq('user_id', user.id).in('item_type', ['PERSONAL_DB', 'DB', '개인DB']).order('id').range(from, to)) : [];
            const owned = new Set([...purchases.map(p => p.exam_id), ...direct.map(p => p.item_id)]);
            const freeSchools = ['경찰대학교','육군사관학교','해군사관학교','공군사관학교','국군간호사관학교'];
            allowed = rows.filter(db => owned.has(db.id) || ['모의고사', '수능'].includes(db.exam_type || '') || freeSchools.includes(db.school || ''));
        }
    }
    return allowed.map(db => ({ ...db, availability: unavailableDbs[db.id] }));
}
