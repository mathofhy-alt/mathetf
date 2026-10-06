import { createAdminClient } from '@/utils/supabase/server-admin';
import { createClient } from '@/utils/supabase/server';
import type { CatalogDb } from './scope';

/**
 * 회원 전용 개인DB (2026-10-06) — 개인DB 요청으로 받은 시중 교재를 운영자가 DB 로 만들어 그 회원에게만 판다.
 *
 * 공개 자료표(exam_materials)에는 넣지 않는다. 홈·학교·사이트맵 등 공개 페이지 15곳 이상이 그 표를 읽기 때문.
 *  - 상품: private_dbs (주인 회원 · 가격 · 문항 묶음 source_db_id)
 *  - 문항: questions.work_status = 'private' — 전체검색·유사문항·예상문제·프린트변형·자동출제 등은
 *    전부 'sorted' 만 읽으므로 다른 회원에게는 자동으로 안 나온다.
 *  - 주인이 결제하면(purchased_items item_type='PRIVATE_DB') 그 회원의 출제 자료 목록에만 추가된다.
 *    question_bank_candidates 는 범위의 sources 로 직접 지정된 경우에만 private 문항을 낸다(20261006_private_db.sql).
 */
export const PRIVATE_ITEM_TYPE = 'PRIVATE_DB';
const ADMIN_EMAIL = 'mathofhy@naver.com';

export type PrivateDb = { id: string; owner_user_id: string; title: string; source_db_id: string; subject: string | null; grade: string | null; price: number; request_id: string | null };

async function currentUser() {
    try { return (await createClient().auth.getUser()).data.user; } catch { return null; }
}

/** 이 회원이 쓸 수 있는 전용 DB — 주인이면서 결제했거나(가격 0 이면 결제 불필요), 운영자면 전부 */
export async function usablePrivateDbs(): Promise<PrivateDb[]> {
    const user = await currentUser();
    if (!user) return [];
    const sb = createAdminClient();
    if (user.email === ADMIN_EMAIL) {
        const { data } = await sb.from('private_dbs').select('*');
        return (data || []) as PrivateDb[];
    }
    const { data: mine } = await sb.from('private_dbs').select('*').eq('owner_user_id', user.id);
    if (!mine?.length) return [];
    const { data: paid } = await sb.from('purchased_items').select('item_id').eq('user_id', user.id).eq('item_type', PRIVATE_ITEM_TYPE);
    const paidIds = new Set((paid || []).map(p => p.item_id));
    return (mine as PrivateDb[]).filter(db => db.price === 0 || paidIds.has(db.id));
}

/** 출제 자료 목록에 붙일 형태. school 자리에 '내 개인DB' 를 넣어 목록에서 한데 묶여 보이게 한다. */
export async function privateCatalog(): Promise<CatalogDb[]> {
    return (await usablePrivateDbs()).map(db => ({
        id: db.id, title: db.title, school: '내 개인DB', grade: db.grade || undefined, subject: db.subject || undefined,
        file_type: 'DB', exam_type: '개인DB', source_db_id: db.source_db_id, private: true,
    } as CatalogDb));
}

/** 문항 id 로 내용을 주는 경로용 — 쓸 수 없는 전용 문항을 뺀다. rows 에 work_status·source_db_id 가 있어야 한다. */
export async function stripPrivate<T extends { work_status?: string | null; source_db_id?: string | null }>(rows: T[]): Promise<T[]> {
    if (!rows.some(r => r.work_status === 'private')) return rows;
    const allowed = new Set((await usablePrivateDbs()).map(db => db.source_db_id));
    return rows.filter(r => r.work_status !== 'private' || (!!r.source_db_id && allowed.has(r.source_db_id)));
}
