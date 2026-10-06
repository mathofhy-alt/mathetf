import { createAdminClient } from '@/utils/supabase/server-admin';
import { verifyUnsubToken } from '@/lib/unsub-token';
import Link from 'next/link';
import Image from 'next/image';

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

    // 수신 거부(10/7 새 디자인) — 계정 화면 틀(rd-auth). 처리 로직은 그대로.
    return (
        <div className="rd rd-auth">
            <div className="rd-auth-card">
                <Link href="/" className="rd-auth-brand"><Image src="/icon.svg" alt="" width={32} height={32} /><span>수학ETF</span></Link>
                {state === 'ok' && (
                    <>
                        <h1 className="rd-auth-title">수신거부 처리됐습니다</h1>
                        <p className="rd-auth-sub">
                            {email && <strong className="rd-auth-strong">{email}</strong>}
                            {email && ' 으로'} 앞으로 광고성 메일을 보내지 않습니다.
                            <br />
                            주문·결제·공지 같은 서비스 안내는 계속 발송됩니다.
                        </p>
                        <p className="rd-auth-ok" role="status">
                            다시 받고 싶으시면 마이페이지 &gt; 설정에서 언제든 켜실 수 있어요.
                        </p>
                    </>
                )}
                {state === 'bad' && (
                    <>
                        <h1 className="rd-auth-title">잘못된 링크입니다</h1>
                        <p className="rd-auth-sub">
                            링크가 잘렸거나 만료됐을 수 있어요. 마이페이지 &gt; 설정에서 직접 끄실 수 있습니다.
                        </p>
                    </>
                )}
                {state === 'error' && (
                    <>
                        <h1 className="rd-auth-title">처리 중 문제가 생겼습니다</h1>
                        <p className="rd-auth-sub">
                            잠시 후 다시 눌러주세요. 계속 안 되면 mathetf.team@gmail.com 으로 알려주시면 직접 처리해 드립니다.
                        </p>
                    </>
                )}
                <div className="rd-auth-actions">
                    <Link href="/" className="rd-btn rd-btn-gray">
                        수학ETF 홈으로
                    </Link>
                </div>
            </div>
        </div>
    );
}
