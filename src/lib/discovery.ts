export const INSTITUTION_CATEGORY: Record<string,string> = {
 '전국연합':'전국연합','평가원':'평가원','수능':'수능','사관학교':'사관학교',
 '육군사관학교':'사관학교','해군사관학교':'사관학교','공군사관학교':'사관학교','국군간호사관학교':'사관학교','경찰대학교':'경찰대',
};
export function schoolDestination(name:string):string {
 return INSTITUTION_CATEGORY[name] ? `/모의고사/${encodeURIComponent(INSTITUTION_CATEGORY[name])}` : `/school/${encodeURIComponent(name)}`;
}
export function questionBankHref(context:Record<string,string|number|undefined|null>):string {
 const params=new URLSearchParams();
 for(const [k,v] of Object.entries(context)) if(v!==undefined && v!==null && v!=='') params.set(k,String(v));
 return `/question-bank${params.size?'?'+params.toString():''}`;
}
const CHOSEONG='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function initials(text:string):string {return [...text].map(c=>{const n=c.charCodeAt(0)-44032;return n>=0&&n<11172?CHOSEONG[Math.floor(n/588)]:c;}).join('');}
export function schoolMatches(name:string,q:string):boolean {
 const term=q.trim().replace(/\s/g,'').toLowerCase();return name.replace(/\s/g,'').toLowerCase().includes(term)||initials(name).includes(term);
}
export function examSeason(at=new Date()):{label:string;semester:string;exam:string} {
 const month=Number(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',month:'numeric'}).format(at));
 if(month<=2)return {label:'새 학년 준비',semester:'1',exam:''};
 if(month<=4)return {label:'1학기 중간고사 대비',semester:'1',exam:'중간고사'};
 if(month<=7)return {label:'1학기 기말고사 대비',semester:'1',exam:'기말고사'};
 if(month<=10)return {label:'2학기 중간고사 대비',semester:'2',exam:'중간고사'};
 return {label:'2학기 기말고사 대비',semester:'2',exam:'기말고사'};
}
export function formatFileSize(bytes?:number|null):string {return typeof bytes==='number'&&bytes>=0 ? bytes<1024*1024?`${Math.ceil(bytes/1024)} KB`:`${(bytes/1024/1024).toFixed(1)} MB`:'용량 확인 중';}
export function materialReadiness(row:any) {return {pdf:!!(row.free_pdf_url||row.has_free_pdf),preview:Array.isArray(row.preview_urls)&&row.preview_urls.length>0,verified:row.is_verified===true};}
