export const CAMPAIGNS = [
 {id:'naver-school',label:'학교 기출 안내',origin:'school',href:'/schools'},
 {id:'naver-common2',label:'공통수학2 범위 출제',origin:'subject',href:'/question-bank?subject=공통수학2'},
 {id:'student-guide',label:'학생 사용 영상',origin:'student-guide',href:'/question-bank?demo=1'},
 {id:'teacher-guide',label:'교사 사용 영상',origin:'teacher-guide',href:'/question-bank?demo=1'},
 {id:'paid-pilot',label:'소규모 광고 검토안',origin:'campaign',href:'/question-bank?demo=1'},
] as const;
export const ORIGINS=['direct','home','exam','school','subject','region','mock','free-pdf','guide','student-guide','teacher-guide','content','campaign','predict','print'] as const;
export function safeAttribution(input:any){return {origin:(ORIGINS as readonly string[]).includes(input?.origin)?input.origin:'direct',campaign:CAMPAIGNS.some(c=>c.id===input?.campaign)?input.campaign:null,device:['mobile','tablet','desktop'].includes(input?.device)?input.device:null};}
export function campaignUrl(id:string){const c=CAMPAIGNS.find(c=>c.id===id);if(!c)return '';const url=new URL(c.href,'https://mathetf.com');url.searchParams.set('campaign',c.id);url.searchParams.set('origin',c.origin);return url.toString();}
