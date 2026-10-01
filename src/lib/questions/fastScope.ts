import { createHash } from 'crypto';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/utils/supabase/server-admin';
import { isPersonalDbFree } from '@/lib/config';
import { availableCatalog } from './catalog';
import { resolveScope, type CatalogDb, type ScopeRule } from './scope';

/**
 * 시험지출제 검색·단원목록의 '범위' 계산을 빠르게 하는 서버 공용 모듈 (2026-10-01).
 *
 * 실측(운영): 검색 1회마다 자료 목록(exam_materials 2,212행, 3쪽)을 새로 읽고,
 * '전체' 선택이면 2,212개 규칙으로 4.8만 문항을 걸러 검색 2~7초 · 단원목록 16초가 걸렸다.
 *  - 자료 목록은 등록 배치 때만 바뀐다 → 5분 캐시 (무료 모드 한정: 유료 모드는 사용자별 구매 목록이라 캐시 불가)
 *  - '전체' 범위에서 빠지는 문항은 ~560개뿐 → 그 목록만 30분 캐시하고 question_bank_all 로 '제외'만 한다
 *  - 단원목록은 같은 범위면 모두에게 같은 결과 → 범위 해시로 10분 캐시
 * 새 SQL 함수(20261001_question_bank_speed.sql)가 없으면 호출부가 예전 길로 돌아간다.
 */

const hash = (v: unknown) => createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 20);

/**
 * 인스턴스 메모리 캐시. [2026-10-02 배포 실측] Vercel 에서는 이 라우트들(force-dynamic)의 unstable_cache 가
 * 유지되지 않아 '전체' 검색이 매번 범위 밖 목록(1.3초)을 새로 계산했다(로컬 next start 에선 정상).
 * 같은 인스턴스가 연달아 요청을 받으므로 메모리에 한 번 더 들고 있는다. 실패한 계산은 지운다.
 */
const memoStore: Map<string, { at: number; value: Promise<any> }> = (globalThis as any).__qb_memo || new Map();
(globalThis as any).__qb_memo = memoStore;
function memo<T>(key: string, ttlMs: number, make: () => Promise<T>): Promise<T> {
    const hit = memoStore.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = make().catch(e => { memoStore.delete(key); throw e; });
    memoStore.set(key, { at: Date.now(), value });
    if (memoStore.size > 200) memoStore.delete(memoStore.keys().next().value as string);
    return value;
}

const freeCatalogCache = unstable_cache(async () => availableCatalog(), ['qb-catalog-v1'], { revalidate: 300, tags: ['qb-catalog'] });
const cachedFreeCatalog = () => memo('catalog', 300_000, freeCatalogCache);

const requestedIds = (requested: unknown): string[] =>
    Array.isArray(requested) ? [...new Set(requested.map((db: any) => typeof db === 'string' ? db : db?.id).filter((id: unknown): id is string => typeof id === 'string'))] : [];

/**
 * 요청 범위를 규칙으로 바꾼다. 캐시된 자료 목록에 없는 자료(방금 등록된 회차)가 섞여 있으면
 * 캐시를 건너뛰고 한 번 더 새 목록으로 확인한다 — 캐시 때문에 새 자료가 '이용할 수 없음' 으로 막히지 않게.
 */
export async function resolveRequestScope(requested: unknown, mockSlug?: unknown): Promise<{ catalog: CatalogDb[]; scope: ScopeRule[] }> {
    if (!isPersonalDbFree()) {
        const catalog = await availableCatalog();
        return { catalog, scope: resolveScope(catalog, requested, mockSlug) };
    }
    let catalog = await cachedFreeCatalog();
    try { return { catalog, scope: resolveScope(catalog, requested, mockSlug) }; }
    catch (e) {
        const known = new Set(catalog.map(db => db.id));
        if (requestedIds(requested).every(id => known.has(id))) throw e;  // 목록 문제가 아님 → 그대로 에러
        catalog = await availableCatalog();
        return { catalog, scope: resolveScope(catalog, requested, mockSlug) };
    }
}

/** 이용 가능한 자료를 전부 고른 요청인가 ('전체 선택' 버튼, 또는 미선택 → 클라이언트가 전체를 보냄) */
export function isWholeCatalog(catalog: CatalogDb[], requested: unknown, mockSlug?: unknown): boolean {
    if (mockSlug) return false;
    const ids = new Set(requestedIds(requested));
    const ready = catalog.filter(db => !db.availability);
    return ready.length > 0 && ready.every(db => ids.has(db.id));
}

const missingFunction = (error: any) => ['PGRST202', '42883'].includes(error?.code);

/**
 * '전체' 범위에서 빠지는 문항 id. 새 SQL 함수가 없으면 null(→ 예전 길).
 * 에러는 캐시되지 않도록 던진 뒤 여기서 null 로 바꾼다.
 */
export async function wholeCatalogIneligible(catalog: CatalogDb[]): Promise<string[] | null> {
    const ready = catalog.filter(db => !db.availability);
    const scope = resolveScope(ready, ready.map(db => db.id));
    const load = unstable_cache(async () => {
        const { data, error } = await createAdminClient().rpc('question_bank_scope_ineligible', { p_scope: scope });
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        return (data || []) as string[];
    }, ['qb-all-ineligible-v1', hash(ready.map(db => db.id).sort())], { revalidate: 1800, tags: ['qb-catalog'] });
    try { return await memo(`ineligible:${hash(ready.map(db => db.id).sort())}`, 1_800_000, load); }
    catch (e: any) {
        if (!missingFunction(e)) console.error('[fastScope] ineligible:', e?.message);
        return null;
    }
}

/** 단원·개념 목록. 같은 범위·옵션이면 10분간 캐시된 결과를 모두가 같이 쓴다. */
export async function cachedFacets(catalog: CatalogDb[], scope: ScopeRule[], whole: boolean, includeOff: boolean): Promise<any[]> {
    const sb = createAdminClient();
    if (whole) {
        const excluded = await wholeCatalogIneligible(catalog);
        if (excluded) {
            const viaAll = unstable_cache(async () => {
                const { data, error } = await sb.rpc('question_bank_facets_all', { p_excluded: excluded, p_include_off: includeOff });
                if (error) throw Object.assign(new Error(error.message), { code: error.code });
                return data || [];
            }, ['qb-facets-all-v1', hash(excluded), String(includeOff)], { revalidate: 600, tags: ['qb-catalog'] });
            try { return await memo(`facets-all:${hash(excluded)}:${includeOff}`, 600_000, viaAll); } catch (e: any) { if (!missingFunction(e)) throw e; }
        }
    }
    const viaScope = unstable_cache(async () => {
        const { data, error } = await sb.rpc('question_bank_facets', { p_scope: scope, p_include_off: includeOff });
        if (error) throw new Error(error.message);
        return data || [];
    }, ['qb-facets-v1', hash(scope), String(includeOff)], { revalidate: 600, tags: ['qb-catalog'] });
    return memo(`facets:${hash(scope)}:${includeOff}`, 600_000, viaScope);
}
