
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
    const supabase = createClient();

    // Check Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { amount, bankName, accountNumber, accountHolder } = await req.json();

        if (!amount || amount <= 0) {
            return NextResponse.json({ success: false, message: 'Invalid amount' }, { status: 400 });
        }
        if (!bankName || !accountNumber || !accountHolder) {
            return NextResponse.json({ success: false, message: 'Missing bank info' }, { status: 400 });
        }

        // Call RPC
        const { data, error } = await supabase.rpc('request_settlement', {
            p_user_id: user.id,
            p_amount: amount,
            p_bank_name: bankName,
            p_account_number: accountNumber,
            p_account_holder: accountHolder
        });

        if (error) {
            console.error('RPC Error:', error);
            return NextResponse.json({ success: false, message: error.message }, { status: 500 });
        }

        if (!data.success) {
            return NextResponse.json({ success: false, message: data.message }, { status: 400 });
        }

        return NextResponse.json({ success: true, requestId: data.request_id });

    } catch (e: any) {
        console.error('Settlement Request Error:', e);
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
