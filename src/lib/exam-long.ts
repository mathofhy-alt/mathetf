import type { LongEditorial } from '@/components/LongEditorial';

// 시험지 장문 분석글(10/22). 2,000장이 넘어 코드 묶음에 넣지 않고 공개 저장소(exam-analysis/<id>.json)에 둔다.
// [10/23] 색인(id → 작성일)도 저장소(exam-analysis/_index.json)로 옮겼다 — 등록 배치가 새 분석글을 올리면
//   배포 없이 시험지 페이지·robots.txt·분석글 사이트맵에 반영된다(올리기: scripts/exam_long/upload.py).
const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/exam-analysis`;

// strict: robots.txt·사이트맵용. 색인을 못 읽으면 빈 목록 대신 오류를 던져 ISR 이 직전 정상본을 계속 내보내게 한다
//   (빈 목록이면 robots 가 구글봇에게 시험지 전부를 '막힘'으로 한 시간 동안 알리게 된다).
export async function getLongIndex(strict = false): Promise<Record<string, string>> {
    try {
        const res = await fetch(`${BASE}/_index.json`, { next: { revalidate: 600 } });
        if (!res.ok) throw new Error(`exam-analysis 색인 ${res.status}`);
        return await res.json();
    } catch (e) {
        if (strict) throw e;
        return {};
    }
}

export async function loadLongEditorial(examId: string): Promise<LongEditorial | null> {
    const at = (await getLongIndex())[examId];
    if (!at) return null;
    try {
        // ?r= 는 저장소 CDN 캐시를 작성일 단위로 끊으려는 것(미리보기의 ?v= 와는 무관)
        const res = await fetch(`${BASE}/${examId}.json?r=${at}`, { next: { revalidate: 3600 } });
        return res.ok ? await res.json() : null;
    } catch {
        return null;
    }
}
