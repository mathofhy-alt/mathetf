import type { createAdminClient } from '@/utils/supabase/server-admin';
import { parseNotify, notifySendAt } from '@/lib/reportDoneNotice';
import { sendNotice, type SmsResult } from '@/lib/sms';

type Admin = ReturnType<typeof createAdminClient>;
export type SuggestionSms = SmsResult | 'not_requested' | 'already_notified' | 'empty_reply' | 'unavailable';

// 다른 DB 오류를 스키마 미적용으로 숨기지 않는다.
export function missingSuggestionNotify(error: { code?: string; message?: string } | null): boolean {
    return !!error && ['42703', 'PGRST204'].includes(error.code || '')
        && /\b(notify|reply_notified_at)\b/i.test(error.message || '');
}

export function suggestionReplyText(title: string | null): string {
    const short = Array.from((title || '').replace(/\s+/g, ' ').trim()).slice(0, 20).join('');
    return `[수학ETF] 남겨 주신 건의사항${short ? `「${short}」` : ''}에 답변이 달렸습니다. 수학ETF 건의사항에서 확인해 주세요.`;
}

/** 답변 저장 이후 호출. 조건부 UPDATE의 반환 행을 받은 요청만 발송한다. */
export async function notifySuggestionReply(admin: Admin, id: string): Promise<SuggestionSms> {
    let { data: post, error } = await admin.from('suggestions')
        .select('id, title, author_id, admin_reply, notify, reply_notified_at').eq('id', id).maybeSingle();
    if (missingSuggestionNotify(error)) {
        // 마이그레이션 전에는 기존 필드만 읽고 답변 저장만 완료한다.
        const legacy = await admin.from('suggestions').select('id, admin_reply').eq('id', id).maybeSingle();
        if (legacy.error) throw legacy.error;
        return 'unavailable';
    }
    if (error) throw error;
    if (!post?.admin_reply?.trim()) return 'empty_reply';
    const notify = parseNotify(post.notify);
    if (!notify) return 'not_requested';
    if (post.reply_notified_at) return 'already_notified';

    const claimedAt = new Date().toISOString();
    const claim = await admin.from('suggestions').update({ reply_notified_at: claimedAt })
        .eq('id', id).is('reply_notified_at', null)
        .eq('admin_reply', post.admin_reply).select('id');
    if (missingSuggestionNotify(claim.error)) return 'unavailable';
    if (claim.error) throw claim.error;
    if (!claim.data?.length) return 'already_notified';

    let sms: SmsResult;
    try {
        let phone: string | undefined;
        if (post.author_id) {
            const account = await admin.auth.admin.getUserById(post.author_id);
            if (account.error) throw account.error;
            phone = account.data.user?.user_metadata?.phone || account.data.user?.phone;
        }
        sms = await sendNotice(phone, suggestionReplyText(post.title), { at: notifySendAt(notify.when) });
    } catch {
        sms = 'failed';
    }
    if (sms === 'failed' || sms === 'dev') {
        // 자신이 잡은 선점만 해제. no_phone은 재시도하지 않는다.
        try {
            const released = await admin.from('suggestions').update({ reply_notified_at: null })
                .eq('id', id).eq('reply_notified_at', claimedAt);
            if (released.error) throw released.error;
        } catch {
            console.error('[suggestion-notify] 선점 해제 실패', { id });
        }
    }
    return sms;
}
