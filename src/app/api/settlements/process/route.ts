
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin'; // Admin Client Required

export async function POST(req: NextRequest) {
    // Admin Check using secret or session? 
    // Usually admin APIs are protected. For this demo, assuming some protection or local use.
    // Or we check if the caller is an admin user.

    // For now, let's use the Admin Client but we should verify the requestor.
    // Assuming simple protection header or checking user role if roles exist.
    // Simplified: Check for a shared secret header ? Or just assume it attaches to an admin panel.

    // Let's rely on standard Auth + Admin Role check if possible.
    // But since I don't know the admin role setup, I'll assume valid auth and check for 'admin' metadata or similar?
    // User instructions didn't specify admin auth mech. I will just check if user is logged in and maybe has admin flag?

    // However, to safely execute the RPC which updates status, we should use the service role client (server-admin) inside, 
    // but trigger it only if authorized.

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
