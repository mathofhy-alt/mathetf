import { createClient } from '@/utils/supabase/server';

/**
 * 문항 이미지를 화면에 보낼 때의 공통 규칙 (2026-10-02).
 *
 * 1) 해설 캡쳐(MANUAL_S_/AUTO_S_)는 로그인한 사람에게만 보낸다.
 *    예전엔 검색 카드의 '해설보기' 가 비로그인에게도 열렸고, 이미지 API 응답에 해설 주소가 그대로 들어 있었다.
 * 2) 문제 캡쳐가 있는 문항은 한글 원본 그림(BMP·PNG base64)을 뺀다 — 카드는 캡쳐만 그린다(QuestionRenderer).
 *    문제 캡쳐가 없는 문항(본문 XML 로 그리는 경우)은 원본 그림을 그대로 둔다.
 */

type ImageRow = { question_id?: string; original_bin_id: string | null };

export const isCapture = (bin: string | null) => !!bin && (bin.startsWith('MANUAL_') || bin.startsWith('AUTO_'));
export const isSolutionCapture = (bin: string | null) => !!bin && (bin.startsWith('MANUAL_S_') || bin.startsWith('AUTO_S_'));
const isQuestionCapture = (bin: string | null) => isCapture(bin) && !isSolutionCapture(bin);

/** 한 문항의 이미지 목록을 위 규칙대로 거른다 */
export function trimQuestionImages<T extends ImageRow>(rows: T[], withSolutions: boolean): T[] {
    const hasQuestionCapture = rows.some(r => isQuestionCapture(r.original_bin_id));
    return rows.filter(r =>
        (withSolutions || !isSolutionCapture(r.original_bin_id)) &&
        (isCapture(r.original_bin_id) || !hasQuestionCapture));
}

/** 해설을 볼 수 있는 요청인가 = 로그인 상태. 세션 확인 실패는 '못 봄' 으로 처리한다. */
export async function canSeeSolutions(): Promise<boolean> {
    try {
        const { data, error } = await createClient().auth.getUser();
        return !error && !!data?.user;
    } catch {
        return false;
    }
}
