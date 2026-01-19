'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/server-admin'
import { revalidatePath } from 'next/cache'

export async function deleteFile(fileId: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: '로그인이 필요합니다.' };
    }

    const adminSupabase = createAdminClient();

    // 1. Verify ownership securely using Admin Client
    const { data: file, error: fetchError } = await adminSupabase
        .from('exam_materials')
        .select('uploader_id, file_path, title')
        .eq('id', fileId)
        .single();

    if (fetchError || !file) {
        return { success: false, message: '자료를 찾을 수 없습니다.' };
    }

    if (file.uploader_id !== user.id) {
        return { success: false, message: '삭제 권한이 없습니다.' };
    }

    // 2. Try Delete from DB (Admin)
    const { error: deleteDbError } = await adminSupabase
        .from('exam_materials')
        .delete()
        .eq('id', fileId);

    if (deleteDbError) {
        console.error('DB Delete Error:', deleteDbError);

        // Foreign Key Violation (e.g. Someone purchased it)
        if (deleteDbError.code === '23503') {
            console.log('Foreign key violation - attempting soft delete');

            // Soft Delete Strategy:
            // 1. Mark as '[Deleted]' in title
            // 2. Hide from common search filters (change region/school to hidden value)
            // 3. (Optional) Set uploader_id to null if schema allows, to hide from MyPage logic.
            //    Since we don't know if uploader_id is nullable, we will rely on filtering 'DELETED' status in frontend or just mangling data.
            //    Let's try setting uploader_id to NULL to detach from user.

            const { error: updateError } = await adminSupabase
                .from('exam_materials')
                .update({
                    title: `[삭제됨] ${file.title}`,
                    school: 'DELETED',
                    region: 'DELETED',
                    district: 'DELETED',
                    // Try to nullify uploader_id to remove from user's list. 
                    // If this fails (NOT NULL constraint), we rely on frontend filtering of 'DELETED' region.
                    uploader_id: null
                })
                .eq('id', fileId);

            if (updateError) {
                // If setting uploader_id to null failed, try keeping uploader_id but just marking deleted
                if (updateError.code === '23502') { // NOT NULL violation
                    const { error: retryError } = await adminSupabase
                        .from('exam_materials')
                        .update({
                            title: `[삭제됨] ${file.title}`,
                            school: 'DELETED',
                            region: 'DELETED',
                            district: 'DELETED'
                        })
                        .eq('id', fileId);

                    if (retryError) {
                        return { success: false, message: '구매 내역이 존재하는 자료라 삭제할 수 없으며, 상태 변경 중 오류가 발생했습니다.' };
                    }
                } else {
                    return { success: false, message: '구매 내역이 존재하는 자료라 삭제할 수 없습니다.' };
                }
            }

            // Soft delete successful
            return { success: true, message: '구매 내역이 있어 목록에서만 숨김 처리되었습니다.' };
        }

        return { success: false, message: `데이터베이스 삭제 중 오류: ${deleteDbError.message}` };
    }

    // 3. Delete from Storage (Admin) - Only if DB delete succeeded (Hard Delete)
    if (file.file_path) {
        const { error: storageError } = await adminSupabase.storage
            .from('exam-materials')
            .remove([file.file_path]);

        if (storageError) {
            console.error('Storage Delete Warning:', storageError);
        }
    }

    revalidatePath('/mypage');
    return { success: true };
}

export async function deletePurchase(purchaseId: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: '로그인이 필요합니다.' };
    }

    const adminSupabase = createAdminClient();

    // 1. Verify ownership
    const { data: purchase, error: fetchError } = await adminSupabase
        .from('purchases')
        .select('user_id')
        .eq('id', purchaseId)
        .single();

    if (fetchError || !purchase) {
        return { success: false, message: '구매 내역을 찾을 수 없습니다.' };
    }

    // Verify the purchase belongs to the requesting user
    if (purchase.user_id !== user.id) {
        return { success: false, message: '삭제 권한이 없습니다.' };
    }

    // 2. Delete from DB
    const { error: deleteError } = await adminSupabase
        .from('purchases')
        .delete()
        .eq('id', purchaseId);

    if (deleteError) {
        console.error('Purchase Delete Error:', deleteError);
        return { success: false, message: '구매 내역 삭제 중 오류가 발생했습니다.' };
    }

    revalidatePath('/mypage');
    return { success: true };
}
