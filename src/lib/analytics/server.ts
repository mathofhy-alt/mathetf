import { NextRequest } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server-admin';
export function productionSite(req: NextRequest): boolean {
    return process.env.VERCEL_ENV === 'production' && ['mathetf.com','www.mathetf.com'].includes(req.nextUrl.hostname);
}
export async function recordDownload(req: NextRequest, userId: string, itemId: string, sessionId?: string) {
    if (!productionSite(req)) return;
    const {error} = await createAdminClient().from('question_bank_events').insert({
        event_id:crypto.randomUUID(),event:'qb_file_response',source:'server',user_id:userId,exam_id:itemId,session_id:sessionId || null,
    });
    if(error) console.error('[QB analytics] download event failed',error.code);
}
