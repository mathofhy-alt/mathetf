
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin'; // Admin Client Required
import { requireAdmin } from '@/utils/admin-auth';

export async function POST(req: NextRequest) {
    // [보안] 출금(정산) 승인/거부는 관리자만. (이전엔 인증이 전혀 없어 누구나 호출 가능했음)
    const { authorized, response } = await requireAdmin();
    if (!authorized) return response;

    const supabaseAdmin = createAdminClient();

    try {
        const { requestId, status, memo } = await req.json();

        if (!requestId || !['completed', 'rejected'].includes(status)) {
            return NextResponse.json({ success: false, message: 'Invalid parameters' }, { status: 400 });
        }

        // Call RPC
        const { data, error } = await supabaseAdmin.rpc('process_settlement', {
            p_request_id: requestId,
            p_new_status: status,
            p_admin_memo: memo
        });

        if (error) {
            console.error('RPC Error:', error);
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        if (!data.success) {
            return NextResponse.json({ success: false, message: data.message }, { status: 400 });
        }

        return NextResponse.json({ success: true });

    } catch (e: any) {
        console.error('Settlement Process Error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
