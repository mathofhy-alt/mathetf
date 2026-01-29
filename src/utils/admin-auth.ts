import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function requireAdmin() {
    const supabase = await createClient();

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return { authorized: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    if (user.email !== 'mathofhy@naver.com') {
        return { authorized: false, response: NextResponse.json({ error: 'Forbidden: Admin access only' }, { status: 403 }) };
    }

    return { authorized: true, user };
}
