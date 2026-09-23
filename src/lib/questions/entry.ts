/** Exact paper identity; subject and exam type remain part of the match. */
export function samePaper(a:any,b:any):boolean {
 return ['school','grade','semester','exam_type','subject'].every(k=>String(a[k]??'')===String(b[k]??''))
  && String(a.exam_year??a.year??'')===String(b.exam_year??b.year??'')
  && (!a.region||!b.region||a.region===b.region) && (!a.district||!b.district||a.district===b.district);
}
export const ENTRY_KEYS=['demo','material','mock','school','subject','region','district','semester','exam'] as const;
export function hasEntryContext(params:URLSearchParams):boolean{return ENTRY_KEYS.some(k=>params.has(k));}
export function entryFilters(subject?:string|null){return {units:[],concepts:[],difficulty:[],subjects:subject?[subject]:[],keywords:[],includeOffCurriculum:false,curriculum:['수학(상)','수학(하)','수학I','수학II','미적분'].includes(subject||'')?'2015':'2022'};}
