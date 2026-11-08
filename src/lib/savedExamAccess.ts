import { createAdminClient } from '@/utils/supabase/server-admin';

/** 보관함 행 자체는 회원이 만들거나 바꿀 수 있다. 저장 RPC의 서버 전용 증거와 파일까지 맞춘다. */
export async function savedExamVerified(userId: string, itemId: string, referenceId: string, hmlPath?: string): Promise<boolean> {
    const admin = createAdminClient();
    const { data, error } = await admin.from('exam_save_proofs').select('item_id, hml_path, legacy_cutoff')
        .eq('item_id', itemId).eq('user_id', userId).eq('reference_id', referenceId).maybeSingle();
    if (error) throw new Error('시험지 저장 기록을 확인하지 못했습니다. 잠시 후 다시 받아 주세요.');
    if (!data || (data.hml_path ?? null) !== (hmlPath ?? null)) return false;
    if (!data.legacy_cutoff) return true;
    const { data: unchanged, error: metadataError } = await admin.rpc('legacy_exam_file_unchanged', {
        p_item: itemId, p_user: userId, p_reference: referenceId, p_path: hmlPath ?? null,
    });
    if (metadataError) throw new Error('시험지 파일 변경 기록을 확인하지 못했습니다. 잠시 후 다시 받아 주세요.');
    return unchanged === true;
}
