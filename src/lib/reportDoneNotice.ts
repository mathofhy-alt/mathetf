/**
 * 무료 타이핑 완성 문자 (10/15 사용자: "완성되면 문자 받을 건지 선택할 수 있게, 받는다면 언제 받을 건지도").
 * 제보할 때 고른 값은 제보 행 description.notify 에 { sms, when } 으로 남고,
 * 판매용 한글 파일이 등록돼 0원 구매가 들어가면 크론(api/cron/report-notify)이 고른 시간대에 한 번 보낸 뒤 notify.sent_at 을 적는다.
 */
export type NotifyWhen = 'asap' | 'morning' | 'afternoon' | 'evening';
export type ReportNotify = { sms: boolean; when: NotifyWhen; sent_at?: string; result?: string };

// 시작·끝 시각(KST). 'asap' 은 밤(21~9시)만 피한다 — 채택 문자와 같은 규칙
// done: 접수 완료 화면 문장
export const NOTIFY_WHEN: { value: NotifyWhen; label: string; done: string; from: number; to: number }[] = [
    { value: 'asap', label: '완성되는 대로 (밤 9시~아침 9시는 피해서)', done: '완성되는 대로', from: 9, to: 21 },
    { value: 'morning', label: '오전 (9시~12시)', done: '완성되면 오전에', from: 9, to: 12 },
    { value: 'afternoon', label: '오후 (12시~6시)', done: '완성되면 오후에', from: 12, to: 18 },
    { value: 'evening', label: '저녁 (6시~9시)', done: '완성되면 저녁에', from: 18, to: 21 },
];

export function parseNotify(v: unknown): ReportNotify | null {
    const o = v as any;
    if (!o || typeof o !== 'object' || o.sms !== true) return null;
    const when = NOTIFY_WHEN.some(w => w.value === o.when) ? o.when as NotifyWhen : 'asap';
    return { sms: true, when };
}

/** 고른 시간대 안이면 null(바로 보냄), 아니면 다음 시간대 시작 시각 */
export function notifySendAt(when: NotifyWhen, now = new Date()): Date | null {
    const w = NOTIFY_WHEN.find(x => x.value === when) || NOTIFY_WHEN[0];
    const kst = new Date(now.getTime() + 9 * 3600_000);
    const h = kst.getUTCHours();
    if (h >= w.from && h < w.to) return null;
    const at = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate(), w.from - 9, 0, 0));
    if (h >= w.to) at.setUTCDate(at.getUTCDate() + 1);
    return at;
}
