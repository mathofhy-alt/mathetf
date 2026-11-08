import { passStatus } from '@/lib/qbPass';
import { questionPreview } from '@/lib/bundlePolicy';
import { createClient } from '@/utils/supabase/server';

/**
 * 문항 이미지를 화면에 보낼 때의 공통 규칙 (2026-10-02).
 *
 * 1) 해설은 강사 이용권/운영자에게만 보내며, 도구 미리보기는 항상 문제 그림만 보낸다.
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
        (withSolutions || isQuestionCapture(r.original_bin_id)) &&
        (isCapture(r.original_bin_id) || !hasQuestionCapture));
}

/** 일반 이미지 API의 해설 권한. 로그인만으로 해설을 허용하지 않는다. */
export async function canSeeSolutions(): Promise<boolean> {
    try {
        const { data, error } = await createClient().auth.getUser();
        return !error && !!data?.user && (await passStatus(data.user)).unlimited;
    } catch {
        return false;
    }
}

/** 문제 XML에서 참조하는 원본만 전달한다. 해설 전용 바이너리도 응답에서 제외한다. */
export function trimPreviewImages<T extends ImageRow>(rows: T[], xml: string): T[] {
    const refs = new Set([...questionPreview(xml).matchAll(/(?:BinItem|BinData|hp:binData|data-hml-bin-id)=["']([^"']+)["']/gi)].map(m => m[1]));
    const hasQuestionCapture = rows.some(r => isQuestionCapture(r.original_bin_id));
    return rows.filter(r => !isSolutionCapture(r.original_bin_id) &&
        (isQuestionCapture(r.original_bin_id) || (!hasQuestionCapture && refs.has(r.original_bin_id || ''))));
}
