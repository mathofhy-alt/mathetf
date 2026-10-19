import type { Candidate, TypeCatalog } from './chatPlan';

type Page = { data: any[] | null; error: { message: string } | null; count?: number | null };
type ReadPage = (table: 'question_type_defs', from: number, to: number, count: boolean) => PromiseLike<Page>;
type ReadCounts = () => PromiseLike<{ data: { unit: string; code: string; n: number }[] | null; error: { message: string } | null }>;

/** 목록과 전체 배정 수만 1시간 보관한다. 문항별 배정은 후보를 받은 시점에 읽는다. */
export function createTypeCatalogCache(read: ReadPage, readCounts: ReadCounts, now = Date.now) {
    let cache: { at: number; value: Promise<TypeCatalog | null> } | null = null;
    async function pages(table: 'question_type_defs') {
        const first = await read(table, 0, 999, true);
        if (first.error) throw new Error(first.error.message);
        if (first.count == null) throw new Error('유형 목록 문항 수를 읽지 못했습니다.');
        const rows = [...(first.data || [])];
        // PostgREST 1,000행 제한. 차가운 인스턴스에서도 조회를 여섯 개씩 묶는다.
        for (let start = 1000; start < first.count; start += 6000) {
            const batch = await Promise.all(Array.from({ length: Math.min(6, Math.ceil((first.count - start) / 1000)) }, (_, i) => read(table, start + i * 1000, start + i * 1000 + 999, false)));
            for (const page of batch) {
                if (page.error) throw new Error(page.error.message);
                rows.push(...(page.data || []));
            }
        }
        if (rows.length !== first.count) throw new Error('유형 목록을 끝까지 읽지 못했습니다.');
        return rows;
    }
    return function typeCatalog(): Promise<TypeCatalog | null> {
        if (cache && now() - cache.at < 3_600_000) return cache.value;
        const value = (async () => {
            const [defs, totals] = await Promise.all([pages('question_type_defs'), readCounts()]);
            if (totals.error) throw new Error(totals.error.message);
            if (!totals.data) throw new Error('유형별 문항 수를 읽지 못했습니다.');
            const counts = new Map<string, number>();
            for (const t of totals.data) {
                const key = JSON.stringify([t.unit, t.code]);
                counts.set(key, t.n);
            }
            const catalog: TypeCatalog = {};
            for (const d of defs) {
                (catalog[d.unit] ||= []).push({ ...d, what: d.what || '', count: counts.get(JSON.stringify([d.unit, d.code])) || 0 });
            }
            for (const list of Object.values(catalog)) list.sort((a, b) => a.ord - b.ord);
            return catalog;
        })().catch(() => { cache = null; return null; });
        cache = { at: now(), value };
        return value;
    };
}

export type TypesOf = (ids: string[]) => Promise<Map<string, NonNullable<Candidate['type']>>>;

/** 후보에 현재 대표 유형을 붙인다. 미분류 문항은 그대로 남긴다. */
export function withTypes(candidates: Candidate[], assignments: Awaited<ReturnType<TypesOf>>): Candidate[] {
    return candidates.map(c => ({ ...c, type: assignments.get(c.id) }));
}
