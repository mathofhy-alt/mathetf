import {ENTRY_KEYS,hasEntryContext} from './entry';
export const DRAFT_KEY = 'mathetf_exam_draft_v1';
export type ExamDraft = {
    version: 1; updatedAt: number; entryContext?:string; cartIds: string[]; selectedDbIds: string[];
    excludedQuestionIds: string[]; selectedExamIds: string[]; filters: any;
    title: string; questionsPerColumn: number; viewMode: 'search' | 'review'; autoOpen: boolean;
};
export function parseDraft(raw: string | null, now = Date.now()): ExamDraft | null {
    try {
        const d = JSON.parse(raw || 'null');
        if (!d || d.version !== 1 || !Number.isFinite(d.updatedAt) || now - d.updatedAt > 7 * 86400000 || d.updatedAt > now + 60000 ||
            !Array.isArray(d.cartIds) || !Array.isArray(d.selectedDbIds)) return null;
        const list = (v:unknown) => Array.isArray(v) ? v.filter((x:unknown)=>typeof x==='string').slice(0,5000) : [];
        const filters = d.filters && typeof d.filters==='object' ? {units:list(d.filters.units),concepts:list(d.filters.concepts),difficulty:list(d.filters.difficulty),subjects:list(d.filters.subjects),keywords:list(d.filters.keywords),includeOffCurriculum:d.filters.includeOffCurriculum===true,...(typeof d.filters.curriculum==='string'?{curriculum:d.filters.curriculum}:{}),...(typeof d.filters.mockSlug==='string'&&d.filters.mockSlug.length<150?{mockSlug:d.filters.mockSlug}:{})}:null;
        return { ...d, filters, cartIds: d.cartIds.filter((x: unknown) => typeof x === 'string').slice(0, 50),
            selectedDbIds: d.selectedDbIds.filter((x: unknown) => typeof x === 'string').slice(0, 5000),
            excludedQuestionIds: Array.isArray(d.excludedQuestionIds) ? d.excludedQuestionIds : [],
            selectedExamIds: Array.isArray(d.selectedExamIds) ? d.selectedExamIds : [],
            title: typeof d.title === 'string' ? d.title.slice(0, 100) : '',
            questionsPerColumn: [1,2,3].includes(d.questionsPerColumn) ? d.questionsPerColumn : 2,
            viewMode: d.viewMode === 'review' ? 'review' : 'search', autoOpen: d.autoOpen === true };
    } catch { return null; }
}

export function draftContext(params:URLSearchParams):string {
    const selected=new URLSearchParams();
    for(const key of [...ENTRY_KEYS,'src'])if(params.has(key))selected.set(key,params.get(key)||'');
    selected.sort();return selected.toString();
}
export function shouldRestoreDraft(draft:ExamDraft|null,params:URLSearchParams):boolean {
    if(!draft)return false;
    return params.has('resume')||(!hasEntryContext(params)&&!params.has('src'))||
        (draft.cartIds.length>0&&draft.entryContext===draftContext(params));
}

// A normal visit restores filters without unexpectedly running an old search.
// Explicit login return and a draft containing selected questions still resume.
export function shouldSearchRestoredDraft(draft: ExamDraft, params: URLSearchParams): boolean {
    return params.has('resume') || draft.cartIds.length > 0;
}
