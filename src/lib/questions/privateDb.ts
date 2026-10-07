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
        const { data } = await sb.from('private_dbs').select('*').order('created_at');
        // 같은 교재를 여러 회원에게 연결하면 줄이 여러 개 — 운영자 목록에는 교재마다 하나(10/7)
        const seen = new Set<string>();
        return ((data || []) as PrivateDb[]).filter(db => !seen.has(db.source_db_id) && !!seen.add(db.source_db_id));
    }
    const { data: mine } = await sb.from('private_dbs').select('*').eq('owner_user_id', user.id);
    if (!mine?.length) return [];
    const { data: paid } = await sb.from('purchased_items').select('item_id').eq('user_id', user.id).eq('item_type', PRIVATE_ITEM_TYPE);
    const paidIds = new Set((paid || []).map(p => p.item_id));
    return (mine as PrivateDb[]).filter(db => db.price === 0 || paidIds.has(db.id));
}

/**
 * [10/7] 교재 폴더 — 상품의 source_db_id 가 교재 이름(맨 앞 이름)이면, 문항 묶음 '교재 > 단원 > 스텝' 전부가 그 상품이다.
 *   결제·연결은 교재 하나, 출제 자료 목록에는 묶음마다 한 칸(폴더 트리로 보이게 path 를 붙인다).
 *   예전 상품(묶음 하나를 그대로 가리킴)은 아래 묶음이 없으니 예전처럼 한 칸.
 */
export const PATH_SEP = ' > ';
/** 이 상품이 이 묶음을 포함하나 — 같거나, 교재 이름 아래 경로 */
export const coversSource = (dbSource: string, source: string) => source === dbSource || source.startsWith(dbSource + PATH_SEP);
const likeEscape = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m);
/** 교재 이름 아래 묶음 찾기용 LIKE 패턴 */
export const subPattern = (dbSource: string) => likeEscape(dbSource + PATH_SEP) + '%';

type Bundle = { source: string; n: number };
const bundleMemo = new Map<string, { at: number; list: Bundle[] }>();
/** 교재 아래 묶음(전용으로 바뀐 문항만) — 문항 2~3천 행을 훑으니 10분 기억한다 */
async function bundlesUnder(dbSource: string): Promise<Bundle[]> {
    const hit = bundleMemo.get(dbSource);
    if (hit && Date.now() - hit.at < 600_000) return hit.list;
    const sb = createAdminClient();
    const count = new Map<string, number>();
    for (let from = 0; from < 50_000; from += 1000) {
        const { data, error } = await sb.from('questions').select('id, source_db_id').eq('work_status', 'private')
            .like('source_db_id', subPattern(dbSource)).order('id').range(from, from + 999);
        if (error) throw error;
        for (const r of data || []) count.set(r.source_db_id, (count.get(r.source_db_id) || 0) + 1);
        if ((data || []).length < 1000) break;
    }
    const list = [...count].map(([source, n]) => ({ source, n })).sort((a, b) => a.source.localeCompare(b.source, 'ko', { numeric: true }));
    bundleMemo.set(dbSource, { at: Date.now(), list });
    return list;
}

/** 출제 자료 목록에 붙일 형태. school 자리에 '내 개인DB' 를 넣어 목록에서 한데 묶여 보이게 한다. */
export async function privateCatalog(): Promise<CatalogDb[]> {
    const out: CatalogDb[] = [];
    for (const db of await usablePrivateDbs()) {
        const base = { school: '내 개인DB', grade: db.grade || undefined, subject: db.subject || undefined, file_type: 'DB', exam_type: '개인DB', private: true };
        const subs = await bundlesUnder(db.source_db_id).catch(() => [] as Bundle[]);
        if (!subs.length) { out.push({ ...base, id: db.id, title: db.title, source_db_id: db.source_db_id } as CatalogDb); continue; }
        // 칸 id = 상품 id + 경로 — 묶음이 늘어도 기존 칸 id 가 바뀌지 않는다
        for (const b of subs) out.push({
            ...base, id: `${db.id}::${b.source.slice(db.source_db_id.length + PATH_SEP.length)}`, title: b.source, source_db_id: b.source,
            book: db.title, path: b.source.slice(db.source_db_id.length + PATH_SEP.length).split(PATH_SEP), question_count: b.n,
        } as CatalogDb);
    }
    return out;
}

/** 문항 id 로 내용을 주는 경로용 — 쓸 수 없는 전용 문항을 뺀다. rows 에 work_status·source_db_id 가 있어야 한다. */
export async function stripPrivate<T extends { work_status?: string | null; source_db_id?: string | null }>(rows: T[]): Promise<T[]> {
    if (!rows.some(r => r.work_status === 'private')) return rows;
    const allowed = (await usablePrivateDbs()).map(db => db.source_db_id);
    return rows.filter(r => r.work_status !== 'private' || (!!r.source_db_id && allowed.some(a => coversSource(a, r.source_db_id!))));
}
