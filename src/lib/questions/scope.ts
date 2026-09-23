import mockLinks from './verified-mock-links.json';
import verifiedLinks from './verified-source-links.json';
import type { DbDescriptor } from './dbFilter';

export type CatalogDb = DbDescriptor & { id: string; availability?: string };
export type ScopeRule = { sources?: string[]; school?: string; grade?: string; year?: string; semesters?: string[]; semesterPrefix?: string; subjects?: string[] };
const mockSubjects = ['기하', '기하와벡터', '미적분II', '미적분', '확률과통계', '확률과 통계'];
export const unavailableDbs: Record<string, string> = {
    'fe34d2ea-2f6b-4c1a-a774-33ab238b2141': '고2 문항 등록 준비 중',
};

// Audited source links identify an original paper, never a curriculum-wide subject alias.
export function toScopeRule(db: CatalogDb): ScopeRule {
    const source = db.source_db_id || (verifiedLinks as Record<string, string>)[db.id];
    if (source) return { sources: [source] };
    const rule: ScopeRule = { school: db.school };
    const grade = String(db.grade || '').replace('고', '');
    if (grade) rule.grade = ['1', '2', '3'].includes(grade) ? `고${grade}` : grade;
    const year = db.title?.match(/20\d{2}/)?.[0] || db.exam_year || db.year;
    if (year) rule.year = String(year);
    if (db.exam_type === '입학시험') rule.semesters = ['입학시험'];
    else if (['모의고사', '수능'].includes(db.exam_type || '')) {
        const month = String(db.semester || '').replace(/월.*$/, '');
        rule.semesters = [`${month}월`, `${month}월 모의고사`];
    } else if (db.semester) {
        const sem = String(db.semester).replace(/[^0-9]/g, '');
        const kind = db.exam_type?.includes('중간') ? '중간' : db.exam_type?.includes('기말') ? '기말' : '';
        if (kind) rule.semesters = [`${sem}학기${kind}`];
        else if (sem) rule.semesterPrefix = `${sem}학기`;
    }
    if (db.subject && !['전과정', '전과목'].includes(db.subject)) {
        rule.subjects = ['모의고사', '수능', '입학시험'].includes(db.exam_type || '') && mockSubjects.includes(db.subject)
            ? ['대수', '미적분I', db.subject] : [db.subject];
    }
    return rule;
}

export function resolveScope(catalog: CatalogDb[], requested: unknown, mockSlug?:unknown): ScopeRule[] {
    if (!Array.isArray(requested) || requested.length > 5000) throw new Error('선택한 자료 범위를 확인해주세요.');
    const map = new Map(catalog.map(db => [db.id, db]));
    const ids = [...new Set(requested.map((db: any) => typeof db === 'string' ? db : db?.id))];
    const scopes=ids.map(id => {
        const db = map.get(id);
        if (!db) throw new Error('이용할 수 없는 자료가 포함되어 있습니다. 자료 목록을 새로 불러와 주세요.');
        if (unavailableDbs[db.id]) throw new Error(unavailableDbs[db.id]);
        return toScopeRule(db);
    });
    if(mockSlug){
        const link=typeof mockSlug==='string'?(mockLinks as Record<string,{source:string;grade?:string|null;dbIds:string[]}>)[mockSlug]:null;
        if(!link||!link.dbIds.every(id=>ids.includes(id)))throw new Error('선택한 모의고사 회차와 자료가 일치하지 않습니다. 회차 제한을 해제하거나 원래 자료를 선택해주세요.');
        return [{sources:[link.source],...(link.grade?{grade:link.grade}:{})}];
    }
    return scopes;
}
