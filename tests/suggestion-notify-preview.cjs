// 로컬 캡처 전용. 운영 환경 파일/자격증명을 사용하지 않고 Supabase를 메모리 HTTP 모의 서버로 대체한다.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    if (fs.existsSync(path.join(root, name))) throw Error('Local preview refuses environment files');
}
const tmp = path.join(root, 'tests/output/suggestion-preview-tmp');
fs.mkdirSync(tmp, { recursive: true });
const uid = '11111111-1111-4111-8111-111111111111';
let hasPhone = true;
const user = () => ({ id: uid, aud: 'authenticated', role: 'authenticated', email: 'preview@example.invalid',
    user_metadata: { full_name: '로컬 검토 회원', ...(hasPhone ? { phone: '01000000000' } : {}) },
    app_metadata: { provider: 'email', providers: ['email'] }, created_at: new Date().toISOString() });
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp: Math.floor(Date.now() / 1000) + 86400 })}.preview`;
const auth = () => ({ access_token: token, refresh_token: 'local-only', token_type: 'bearer', expires_in: 86400,
    expires_at: Math.floor(Date.now() / 1000) + 86400, user: user() });
const mock = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:54339');
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:3126');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'OPTIONS') return res.end('{}');
    if (url.pathname === '/auth/v1/user') return res.end(JSON.stringify(user()));
    if (url.pathname === '/auth/v1/token') return res.end(JSON.stringify(auth()));
    if (url.pathname.startsWith('/rest/v1/')) {
        res.setHeader('Content-Range', '0-0/0');
        return res.end(req.headers.accept?.includes('vnd.pgrst.object') ? JSON.stringify({ id: uid, name: '로컬 검토 회원', earned_points: 0, purchased_points: 0 }) : '[]');
    }
    res.statusCode = 404; res.end('{}');
});
let app;
const stop = () => { app?.kill(); mock.closeAllConnections(); mock.close(); proxy.closeAllConnections(); proxy.close(); };
const proxy = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:3126');
    if (url.pathname === '/__stop' && req.method === 'POST') { res.end('stopped'); setTimeout(stop, 100); return; }
    if (url.pathname === '/__preview') {
        hasPhone = url.searchParams.get('phone') !== '0';
        res.setHeader('Set-Cookie', `sb-127-auth-token=base64-${b64(auth())}; Path=/; SameSite=Lax`);
        res.writeHead(302, { Location: '/__frame' }); res.end(); return;
    }
    if (url.pathname === '/__frame') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>건의사항 390px 로컬 검토</title>
            <style>body{margin:0;background:#e5e7eb;font:15px sans-serif}header{padding:12px}iframe{display:block;width:390px;height:1400px;border:0;margin:0 20px;background:white}</style>
            <header>로컬 모의 회원 · iframe viewport 390px · <b id="metrics">확인 중</b></header>
            <iframe title="모바일 글쓰기" src="/suggestion/write"></iframe><script>
            const frame=document.querySelector('iframe');setInterval(()=>{try{const d=frame.contentDocument;
            const width=frame.contentWindow.innerWidth,sw=d.documentElement.scrollWidth;
            const inputs=[...d.querySelectorAll('.rd-bd-form input,.rd-bd-form select,.rd-bd-form textarea')];
            const overflow=inputs.some(e=>e.getBoundingClientRect().right>width||e.getBoundingClientRect().left<0);
            const ready=!!d.querySelector('.rd-bd-notify')||d.body.textContent.includes('휴대폰 번호가 없어');
            document.querySelector('#metrics').textContent=JSON.stringify({viewport:width,scrollWidth:sw,overflow,ready});
            }catch{}},500);</script></html>`); return;
    }
    if (url.pathname.startsWith('/_next/static/')) {
        const base = path.resolve(root, '.next-review/static');
        const file = path.resolve(base, decodeURIComponent(url.pathname.slice('/_next/static/'.length)));
        if (file.startsWith(base + path.sep)) {
            try { const bytes = fs.readFileSync(file); res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'text/css'); res.end(bytes); return; } catch {}
        }
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: 3127, path: req.url, method: req.method, headers: req.headers }, response => {
        res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { res.statusCode = 503; res.end('Local preview starting'); }); req.pipe(upstream);
});
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SystemRoot|WINDIR|COMSPEC|PATHEXT|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|SYSTEMDRIVE)$/i.test(key)));
Object.assign(env, { TEMP: tmp, TMP: tmp, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_LOCAL_PREVIEW: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54339', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-preview-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'local-preview-service', VERCEL_ENV: 'development', NODE_ENV: 'development' });
mock.listen(54339, '127.0.0.1', () => proxy.listen(3126, '127.0.0.1', () => {
    app = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '-H', '127.0.0.1', '-p', '3127'],
        { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    app.on('exit', () => { mock.close(); proxy.close(); });
    console.log('LOCAL ONLY: http://127.0.0.1:3126/__preview');
}));
process.on('SIGINT', stop); process.on('SIGTERM', stop);
