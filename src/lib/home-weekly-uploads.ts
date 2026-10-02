import { unpackHomeRow } from '@/lib/data';

export type WeeklyUpload = {
    start: string;
    end: string;
    count: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function koreaDate(now: Date): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
}

function dayNumber(date: string): number {
    return Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function isoDay(day: number): string {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

// A PDF, HWP and question DB for one school exam are one uploaded paper.
// Use its first file date so a later file addition does not make an old paper new again.
// [2026-10-02] 단, 교체(새 파일로 다시 올림)는 올린 것으로 센다 — 사용자 지시. 교체일은 replaced_at.
export function countThisWeekUploads(packedRows: any[][], now = new Date()): WeeklyUpload {
    const today = koreaDate(now);
    const todayNumber = dayNumber(today);
    // Home catalog dates have day precision: today plus the previous six days (KST).
    const startDay = todayNumber - 6;
    const firstUploadByExam = new Map<string, number>();
    const lastReplacedByExam = new Map<string, number>();

    for (const packed of packedRows) {
        const row = unpackHomeRow(packed);
        if (row.content_type === '원본제보' || !/^\d{4}-\d{2}-\d{2}$/.test(row.created_at || '')) continue;
        const key = `${row.region || ''}-${row.district || ''}-${row.school}-${row.exam_year || Number(today.slice(0, 4))}-${row.grade}-${row.semester}-${row.exam_type}-${row.subject || 'Unknown'}`;
        const uploaded = dayNumber(row.created_at);
        const first = firstUploadByExam.get(key);
        if (first === undefined || uploaded < first) firstUploadByExam.set(key, uploaded);
        if (/^\d{4}-\d{2}-\d{2}$/.test(row.replaced_at || '')) {
            const replaced = dayNumber(row.replaced_at);
            if (replaced > (lastReplacedByExam.get(key) ?? -Infinity)) lastReplacedByExam.set(key, replaced);
        }
    }

    let count = 0;
    for (const [key, firstUpload] of firstUploadByExam) {
        const uploaded = Math.max(firstUpload, lastReplacedByExam.get(key) ?? firstUpload);
        if (uploaded >= startDay && uploaded <= todayNumber) count++;
    }
    return { start: isoDay(startDay), end: today, count };
}
