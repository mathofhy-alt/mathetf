import { createAdminClient } from '@/utils/supabase/server-admin';
import { verifyUnsubToken } from '@/lib/unsub-token';
import Link from 'next/link';

// 검색엔진에 남을 이유가 없는 페이지다.
export const metadata = { robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/**
 * 광고성 메일 하단의 '수신거부' 링크가 닿는 곳.
 * 토큰만으로 즉시 처리한다 — 로그인·확인 버튼을 요구하지 않는다(법이 요구하는 '쉬운 거부').
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: { t?: string } }) {
    const token = searchParams?.t || '';
    let state: 'ok' | 'bad' | 'error' = 'bad';
    let email = '';

    const userId = token ? verifyUnsubToken(token) : null;
    if (userId) {
        try {
            const admin = createAdminClient();
            const { data } = await admin.auth.admin.getUserById(userId);
            const meta = data?.user?.user_metadata || {};
            email = data?.user?.email || '';
            const { error } = await admin.auth.admin.updateUserById(userId, {
                user_metadata: { ...meta, marketing_agreed: false },
            });
            state = error ? 'error' : 'ok';
        } catch {
            state = 'error';
        }
    }

    return (
        <div className="min-h-screen bg-[#F8FAFD] text-[#1E2D4F] font-sans flex items-center justify-center px-4">
            <div className="bg-white max-w-md w-full rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
                {state === 'ok' && (
                    <>
                        <h1 className="text-xl font-black mb-2">수신거부 처리됐습니다</h1>
                        <p className="text-slate-500 text-sm break-keep">
                            {email && <strong className="text-slate-700">{email}</strong>}
                            {email && ' 으로'} 앞으로 광고성 메일을 보내지 않습니다.
                            <br />
                            주문·결제·공지 같은 서비스 안내는 계속 발송됩니다.
                        </p>
                        <p className="text-xs text-slate-400 mt-4 break-keep">
                            다시 받고 싶으시면 마이페이지 &gt; 설정에서 언제든 켜실 수 있어요.
                        </p>
                    </>
                )}
                {state === 'bad' && (
                    <>
                        <h1 className="text-xl font-black mb-2">잘못된 링크입니다</h1>
                        <p className="text-slate-500 text-sm break-keep">
                            링크가 잘렸거나 만료됐을 수 있어요. 마이페이지 &gt; 설정에서 직접 끄실 수 있습니다.
                        </p>
                    </>
                )}
                {state === 'error' && (
                    <>
                        <h1 className="text-xl font-black mb-2">처리 중 문제가 생겼습니다</h1>
                        <p className="text-slate-500 text-sm break-keep">
                            잠시 후 다시 눌러주세요. 계속 안 되면 mathetf.team@gmail.com 으로 알려주시면 직접 처리해 드립니다.
                        </p>
                    </>
                )}
                <Link href="/" className="inline-block mt-6 text-sm font-bold text-[#497AB7] hover:underline">
                    수학ETF 홈으로 →
                </Link>
            </div>
        </div>
    );
}
