/**
 * 가입 이메일 검사 (10/10) — 화면(중복 확인·가입)과 서버(api/auth/signup)가 같이 쓴다.
 * 이메일 인증을 건너뛰고(email_confirm: true) 전화로만 본인 확인을 해서, 'mascada@navercom'·'…@gmail.comcom'
 * 같은 주소가 그대로 가입됐다(메일이 안 간다). 형식이 틀렸거나 흔한 오타가 분명한 것만 막고, 고칠 주소를 알려 준다.
 * ⚠ 비슷하기만 한 도메인(mail.com 등 실제로 있는 곳)은 막지 않는다 — 아래 TYPOS 에 적힌 것만 오타로 본다.
 */
const KNOWN = ['naver.com', 'gmail.com', 'hanmail.net', 'daum.net', 'nate.com', 'kakao.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'yahoo.com'];

const TYPOS: Record<string, string> = {
    'naver.co': 'naver.com', 'naver.con': 'naver.com', 'naver.cm': 'naver.com', 'naver.om': 'naver.com', 'naver.comm': 'naver.com',
    'nave.com': 'naver.com', 'navr.com': 'naver.com', 'naer.com': 'naver.com', 'naber.com': 'naver.com', 'nvaer.com': 'naver.com', 'naveer.com': 'naver.com', 'naver.net': 'naver.com',
    'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmail.om': 'gmail.com', 'gmail.comm': 'gmail.com', 'gmail.net': 'gmail.com',
    'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmali.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmil.com': 'gmail.com',
    'hanmail.ner': 'hanmail.net', 'hanmail.nt': 'hanmail.net', 'hanmail.com': 'hanmail.net', 'hanmial.net': 'hanmail.net', 'hanmai.net': 'hanmail.net', 'hamail.net': 'hanmail.net',
    'daum.ner': 'daum.net', 'daum.com': 'daum.net', 'duam.net': 'daum.net',
    'nate.con': 'nate.com', 'nate.co': 'nate.com', 'kakao.con': 'kakao.com', 'hotmail.con': 'hotmail.com', 'hotmal.com': 'hotmail.com',
};

export type EmailCheck = { ok: true; email: string } | { ok: false; message: string; suggestion?: string };

export function checkEmail(raw: string): EmailCheck {
    const email = String(raw || '').trim().toLowerCase();
    const m = email.match(/^([^\s@]+)@([^\s@]+)$/);
    if (!m) return { ok: false, message: '이메일 형식이 올바르지 않아요. 예: example@naver.com' };
    const [, local, domain] = m;
    const suggest = (d: string): EmailCheck => ({ ok: false, message: `혹시 ${local}@${d} 인가요? 이메일 주소를 다시 확인해 주세요.`, suggestion: `${local}@${d}` });

    // 점이 빠진 도메인: navercom → naver.com
    const noDot = KNOWN.find(k => k.replace('.', '') === domain);
    if (noDot) return suggest(noDot);
    // 끝이 반복된 도메인: gmail.comcom · gmail.com.com
    const rep = domain.match(/^(.+?\.(com|net|kr))(\.?\2)+$/);
    if (rep) return suggest(rep[1]);
    if (TYPOS[domain]) return suggest(TYPOS[domain]);

    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(domain) || /\.\./.test(email) || local.length > 64)
        return { ok: false, message: '이메일 주소의 @ 뒷부분이 올바르지 않아요. 예: example@naver.com' };
    return { ok: true, email };
}
