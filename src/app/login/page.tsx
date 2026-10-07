import Link from 'next/link';
import Image from 'next/image';
import { login } from './actions';
import { safeReturnPath } from '@/lib/auth-return';

// 로그인(10/7 새 디자인) — 가운데 카드 하나. 계정 화면(회원가입·아이디/비밀번호 찾기)이 같은 틀(rd-auth)을 쓴다.
export default function Login({ searchParams }: { searchParams: { message?: string; next?: string } }) {
    const next = safeReturnPath(searchParams?.next);
    const signIn = async (formData: FormData) => { 'use server'; await login(formData); };
    return <div className="rd rd-auth">
        <div className="rd-auth-card">
            <Link href="/" className="rd-auth-brand"><Image src="/icon.svg" alt="" width={32} height={32} /><span>수학ETF</span></Link>
            <h1 className="rd-auth-title">로그인</h1>
            <p className="rd-auth-sub">로그인하고 만들던 시험지를 이어가세요.</p>
            {searchParams?.message && <p className="rd-auth-error" role="alert">{searchParams.message}</p>}
            <form action={signIn} className="rd-auth-form">
                <input type="hidden" name="next" value={next} />
                <label htmlFor="email" className="rd-auth-label">이메일</label>
                <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required className="rd-input" />
                <label htmlFor="password" className="rd-auth-label">비밀번호</label>
                <input id="password" name="password" type="password" autoComplete="current-password" placeholder="비밀번호를 입력하세요" required className="rd-input" />
                <button className="rd-btn rd-btn-primary rd-btn-block rd-auth-submit" type="submit">로그인</button>
            </form>
            <div className="rd-auth-links">
                <Link href="/find-id">아이디 찾기</Link>
                <Link href="/forgot-password">비밀번호 찾기</Link>
            </div>
            <div className="rd-auth-join">
                <span>아직 계정이 없으신가요?</span>
                <Link href={'/signup?next=' + encodeURIComponent(next)} className="rd-btn rd-btn-gray rd-btn-block">무료 회원가입</Link>
            </div>
        </div>
        <Link className="rd-auth-home" href="/">홈으로 돌아가기</Link>
    </div>;
}
