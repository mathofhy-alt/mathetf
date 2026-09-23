'use client';
import {safeAttribution} from './campaigns';
let fallbackSession: string | undefined;
export function questionBankSession(): string {
    if (typeof window === 'undefined') return '';
    try {
        const key = 'mathetf_qb_session';
        let id = sessionStorage.getItem(key);
        if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key,id); }
        return id;
    } catch { return fallbackSession ||= crypto.randomUUID(); }
}
export function logQuestionBankEvent(event: string, details: Record<string,unknown> = {}): void {
    if (typeof window === 'undefined' || !['mathetf.com','www.mathetf.com'].includes(window.location.hostname)) return;
    let stored={};try{stored=JSON.parse(sessionStorage.getItem('mathetf_qb_attribution')||'{}');}catch{}
    const params=new URLSearchParams(location.search);const attribution=safeAttribution({...stored,...(params.has('origin')?{origin:params.get('origin')} : {}),...(params.has('campaign')?{campaign:params.get('campaign')}:{}),device:innerWidth<768?'mobile':innerWidth<1024?'tablet':'desktop'});
    const count = typeof details.question_count === 'number' ? details.question_count : undefined;
    const gtag = (window as any).gtag;
    if (gtag) gtag('event',event,{site:'mathetf',question_count:count});
    if (event === 'qb_save') return; // A completion is recorded by the save transaction, never this browser claim.
    void fetch('/api/analytics/question-bank',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,
        body:JSON.stringify({event,eventId:crypto.randomUUID(),sessionId:questionBankSession(),questionCount:count,...attribution})}).catch(()=>{});
}
