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

    // 1. Verify ownership & get metadata
    const { data: file, error: fetchError } = await adminSupabase
        .from('exam_materials')
        .select('uploader_id, file_path, school, grade, semester, exam_type, subject, exam_year, content_type, sales_count')
        .eq('id', fileId)
        .single();

    if (fetchError || !file) {
        return { success: false, message: '자료를 찾을 수 없습니다.' };
    }

    if (file.uploader_id !== user.id) {
        return { success: false, message: '삭제 권한이 없습니다.' };
    }

    // 2. Block deletion if anyone has purchased this file
    if ((file.sales_count || 0) > 0) {
        return { success: false, message: '구매 내역이 있는 자료는 삭제할 수 없습니다. ‘판매 중단’을 사용해 주세요.' };
    }

    // 3. Find siblings (PDF & HWP pair)
    const { data: siblings } = await adminSupabase
        .from('exam_materials')
        .select('id, file_path')
        .eq('uploader_id', user.id)
        .eq('school', file.school)
        .eq('grade', file.grade)
        .eq('semester', file.semester)
        .eq('exam_type', file.exam_type)
        .eq('subject', file.subject)
        .eq('exam_year', file.exam_year)
        .eq('content_type', file.content_type);

    const siblingIds = siblings && siblings.length > 0 ? siblings.map(s => s.id) : [fileId];
    const filePaths = siblings && siblings.length > 0 ? siblings.map(s => s.file_path).filter(Boolean) : [file.file_path];

    // 4. Hard Delete from DB
    const { error: deleteDbError } = await adminSupabase
        .from('exam_materials')
        .delete()
        .in('id', siblingIds);

    if (deleteDbError) {
        console.error('DB Delete Error:', deleteDbError);
        return { success: false, message: `데이터베이스 삭제 중 오류: ${deleteDbError.message}` };
    }

    // 5. Delete from Storage
    if (filePaths && filePaths.length > 0) {
        const { error: storageError } = await adminSupabase.storage
            .from('exam-materials')
            .remove(filePaths as string[]);

        if (storageError) {
            console.error('Storage Delete Warning:', storageError);
        }
    }

    revalidatePath('/mypage');
    return { success: true, deletedIds: siblingIds };
}

export async function stopSelling(fileId: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: '로그인이 필요합니다.' };
    }

    const adminSupabase = createAdminClient();

    // 1. Verify ownership & get metadata
    const { data: file, error: fetchError } = await adminSupabase
        .from('exam_materials')
        .select('uploader_id, school, grade, semester, exam_type, subject, exam_year, content_type')
        .eq('id', fileId)
        .single();

    if (fetchError || !file) {
        return { success: false, message: '자료를 찾을 수 없습니다.' };
    }

    if (file.uploader_id !== user.id) {
        return { success: false, message: '권한이 없습니다.' };
    }

    // 2. Find siblings (PDF & HWP pair)
    const { data: siblings } = await adminSupabase
        .from('exam_materials')
        .select('id')
        .eq('uploader_id', user.id)
        .eq('school', file.school)
        .eq('grade', file.grade)
        .eq('semester', file.semester)
        .eq('exam_type', file.exam_type)
        .eq('subject', file.subject)
        .eq('exam_year', file.exam_year)
        .eq('content_type', file.content_type);

    const siblingIds = siblings && siblings.length > 0 ? siblings.map(s => s.id) : [fileId];

    // 3. Mark as stopped: school='DELETED' hides from marketplace & uploader list
    //    file_path and uploader_id are PRESERVED so existing buyers can still download
    const { error: updateError } = await adminSupabase
        .from('exam_materials')
        .update({
            school: 'DELETED',
            region: 'DELETED',
            district: 'DELETED'
        })
        .in('id', siblingIds);

    if (updateError) {
        console.error('Stop Selling Error:', updateError);
        return { success: false, message: `판매 중단 오류: ${updateError.message}` };
    }

    revalidatePath('/mypage');
    return { success: true, stoppedIds: siblingIds };
}

export async function deletePurchase(purchaseId: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: '로그인이 필요합니다.' };
    }

    const adminSupabase = createAdminClient();

    // 1. Verify ownership across both tables
    const { data: purchaseOld } = await adminSupabase
        .from('purchases')
        .select('user_id')
        .eq('id', purchaseId)
        .maybeSingle();

    const { data: purchaseNew } = await adminSupabase
        .from('purchased_items')
        .select('user_id')
        .eq('id', purchaseId)
        .maybeSingle();

    const purchase = purchaseOld || purchaseNew;

    if (!purchase) {
        return { success: false, message: '구매 내역을 찾을 수 없습니다.' };
    }

    // Verify the purchase belongs to the requesting user
    if (purchase.user_id !== user.id) {
        return { success: false, message: '삭제 권한이 없습니다.' };
    }

    // 2. Delete from DB (try both gracefully)
    await adminSupabase.from('purchases').delete().eq('id', purchaseId);
    await adminSupabase.from('purchased_items').delete().eq('id', purchaseId);

    revalidatePath('/mypage');
    return { success: true };
}

export async function updateExamMaterial(fileId: string, updates: any) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { success: false, message: '로그인이 필요합니다.' };
    }

    const adminSupabase = createAdminClient();

    const { data: file, error: fetchError } = await adminSupabase
        .from('exam_materials')
        .select('uploader_id, school, grade, semester, exam_type, subject, exam_year, content_type')
        .eq('id', fileId)
        .single();

    if (fetchError || !file) {
        return { success: false, message: '자료를 찾을 수 없습니다.' };
    }

    if (file.uploader_id !== user.id) {
        return { success: false, message: '수정 권한이 없습니다.' };
    }

    // 2. Find siblings to apply metadata updates
    const { data: siblings } = await adminSupabase
        .from('exam_materials')
        .select('id')
        .eq('uploader_id', user.id)
        .eq('school', file.school)
        .eq('grade', file.grade)
        .eq('semester', file.semester)
        .eq('exam_type', file.exam_type)
        .eq('subject', file.subject)
        .eq('exam_year', file.exam_year)
        .eq('content_type', file.content_type);

    const siblingIds = siblings && siblings.length > 0 ? siblings.map(s => s.id) : [fileId];

    // 3. Update DB
    // First, update the target file with ALL updates (including file_path, price, etc.)
    const { error: updateError } = await adminSupabase
        .from('exam_materials')
        .update(updates)
        .eq('id', fileId);

    // Then, update siblings with ONLY metadata updates to prevent overwriting their file_path/price
    const metadataUpdates = {
        school: updates.school,
        region: updates.region,
        district: updates.district,
        exam_year: updates.exam_year,
        grade: updates.grade,
        semester: updates.semester,
        exam_type: updates.exam_type,
        subject: updates.subject,
        title: updates.title
    };
    
    const otherSiblingIds = siblingIds.filter(id => id !== fileId);
    if (otherSiblingIds.length > 0) {
        await adminSupabase
            .from('exam_materials')
            .update(metadataUpdates)
            .in('id', otherSiblingIds);
    }

    if (updateError) {
        console.error('Update Error:', updateError);
        // Special check for exam_year column missing
        if (updateError.message.includes('exam_year')) {
            return {
                success: false,
                message: '데이터베이스에 "연도(exam_year)" 컬럼이 없습니다. SQL을 실행하여 컬럼을 먼저 추가해주세요.'
            };
        }
        return { success: false, message: `수정 중 오류 발생: ${updateError.message}` };
    }

    // 3. Invalidate Caches (CRITICAL: Includes homepage)
    revalidatePath('/');
    revalidatePath('/mypage');

    return { success: true };
}
