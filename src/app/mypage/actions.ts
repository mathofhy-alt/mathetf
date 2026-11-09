'use server'

// [10/6] deleteFile·stopSelling·updateExamMaterial(예전 판매자용) 제거 — 회원 업로드는 원본 제보뿐인데
//   updateExamMaterial 은 받은 값을 그대로 본인 행에 써서, 제보 행을 '해설'·가격 붙은 공개 자료로 바꿀 수 있었다.

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/server-admin'
import { revalidatePath } from 'next/cache'



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

    // Hide the list entry; the immutable purchase rows still prove delivery.
    const { error } = await adminSupabase.rpc('hide_purchase', { p_purchase_id: purchaseId, p_user_id: user.id });
    if (error) return { success: false, message: '구매 내역을 숨기지 못했습니다. 다시 시도해주세요.' };

    revalidatePath('/mypage');
    return { success: true };
}

