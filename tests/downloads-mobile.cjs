// Real Next UI + local fake Supabase only. Never signs into a production account.
require('./register.cjs');
const http = require('node:http');
const JSZip = require('jszip');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const { attachment } = require('../src/lib/downloads.ts');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || 'C:/Users/matho/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightPath);
const root = path.resolve(__dirname, '..');
const output = 'C:/selfmade/다운로드수리';
const base = 'http://127.0.0.1:3125';
const uid = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'mobile-test@example.invalid', user_metadata: { marketing_agreed: true }, app_metadata: {}, created_at: new Date().toISOString() };
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })}.local-test`;
const auth = { access_token: token, refresh_token: 'local-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600, user };
const exam = { id, title: '모바일 검증학교 2026년 1학년 2학기 중간고사 공통수학2', school: '모바일검증고등학교', region: '서울', district: '강남구', exam_year: 2026, grade: 1, semester: 2, exam_type: '중간고사', subject: '공통수학2', content_type: '해설', file_type: 'HWP', file_path: `${uid}/test.hwpx`, price: 2000, created_at: new Date().toISOString(), uploader_name: '운영자', preview_urls: [], free_pdf_url: null };
const purchasedAt = new Date(Date.now() - 86400_000).toISOString();
let scenario = 'paid';
const calls = [];
const archiveFiles = [1,2,3].map(n => ({ path: `${uid}/original_${n}.hwp`, name: `원본_${n}.hwp` }));
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1:3126');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    calls.push({ method: req.method, path: url.pathname });
    res.setHeader('Access-Control-Allow-Origin', base);
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info,prefer,range,accept-profile');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,HEAD,OPTIONS');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range');
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Range': '0-0/1' }); res.end(req.method === 'HEAD' ? '' : JSON.stringify(value)); };
    if (req.method === 'OPTIONS') return json({});
    if (url.pathname === '/auth/v1/user') return json(scenario.startsWith('admin') ? { ...user, email: 'mathofhy@naver.com' } : user);
    if (url.pathname === '/auth/v1/token') return json(auth);
    if (url.pathname.startsWith('/storage/v1/object/sign/') && req.method === 'POST') return json({ signedURL: '/object/sign/exam-materials/test.hwpx?token=local-only' });
    if (url.pathname.startsWith('/storage/v1/object/sign/')) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': attachment(url.searchParams.get('download') || 'test.hwpx') });
        return res.end('LOCAL TEST FILE, NOT A PRODUCTION FILE');
    }
    if (url.pathname.includes('/storage/v1/object/') && req.method === 'GET') {
        await new Promise(resolve => setTimeout(resolve, 650)); // Slower than the old 400 ms navigation loop.
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        return res.end('ARCHIVE CONTENT: ' + url.pathname.split('/').pop());
    }
    const table = url.pathname.split('/').pop();
    let rows = [];
    const purchase = { id: '33333333-3333-4333-8333-333333333333', user_id: uid, item_id: id, title: exam.title, item_type: 'HWP_DOC', payment_id: scenario === 'typing' ? 'typing-local' : 'paid-local', created_at: scenario === 'expired' || scenario === 'typing' ? '2020-01-01T00:00:00Z' : purchasedAt, price_paid: scenario === 'typing' ? 0 : 2000 };
    if (table === 'exam_materials') rows = scenario.startsWith('admin') ? [{ ...exam, content_type:'원본제보', description:JSON.stringify({ files:archiveFiles.map(f=>f.path) }) }] : [exam];
    if (table === 'db_requests') rows = [{ id, user_id:uid,user_email:user.email,status:'접수',created_at:purchasedAt,files:archiveFiles }];
    if (table === 'payment_history') rows = [{ user_id:uid, payment_id:'paid-local', status:scenario==='cancelled'?'CANCELLED':'PAID' }];
    if (table === 'payment_orders') rows = [];
    if (table === 'purchased_items') rows = scenario === 'unowned' ? [] : [purchase];
    if (table === 'profiles') rows = [{ id: uid, earned_points: 0, purchased_points: 0, persona: 'student' }];
    if (table === 'schools') rows = [{ region: '서울', district: '강남구', name: exam.school }];
    for (const [key, value] of url.searchParams) {
        if (value.startsWith('eq.')) rows = rows.filter(r => String(r[key]) === value.slice(3));
        if (value.startsWith('neq.')) rows = rows.filter(r => String(r[key]) !== value.slice(4));
        if (value.startsWith('in.')) rows = rows.filter(r => value.slice(3).includes(String(r[key])));
    }
    if (Number(url.searchParams.get('offset')) > 0) rows = [];
    // No production path is ever returned to the browser metadata query.
    if (table === 'exam_materials' && req.headers.authorization !== 'Bearer local-service-role') rows = rows.map(({ file_path, ...metadata }) => metadata);
    return json(req.headers.accept?.includes('application/vnd.pgrst.object+json') ? rows[0] || null : rows);
});

let next, browser;
const log = fs.createWriteStream(path.join(output, 'mobile-server2.log'));
const results = [];
async function ready() {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
        if (next.exitCode !== null) throw Error('Next server exited. See mobile-server.log.');
        try { const r = await fetch(base + '/api/download?item=' + id); if (r.status === 401) return; } catch { }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw Error('Next startup timeout');
}
async function contextFor(ua, loggedIn = true) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua, isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true });
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['127.0.0.1','localhost'].includes(url.hostname) ? route.continue() : route.abort();
    });
    if (loggedIn) await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + b64(auth), domain: '127.0.0.1', path: '/' }]);
    await context.addInitScript(() => { localStorage.setItem('mathetf_notify_dismissed','1'); localStorage.setItem('mathetf_teacher_cta_dismissed','1'); });
    return context;
}
(async () => {
    await new Promise(resolve => server.listen(3126, '127.0.0.1', resolve));
    next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', '3125'], {
        cwd: root, windowsHide: true,
        env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3126', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'local-service-role', NEXT_PUBLIC_LOCAL_PREVIEW: '1', NEXT_TELEMETRY_DISABLED: '1' },
        stdio: ['ignore','pipe','pipe'],
    });
    next.stdout.pipe(log); next.stderr.pipe(log);
    await ready();
    // Warm the initial dev compilation before opening a mobile document.
    await fetch(base+'/mypage');
    await fetch(base+'/_next/static/chunks/webpack.js');
    browser = await chromium.launch({ headless: true });
    const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    for (const [label, ua] of [['ios-safari', safari], ['naver-inapp', safari + ' NAVER(inapp; search; 2000; 12.9.0; 18)']]) {
        const context = await contextFor(ua);
        const page = await context.newPage();

        page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
        page.on('console', message => { if (message.type() === 'error') console.error('BROWSER:', message.text()); });
        page.on('dialog', dialog => dialog.dismiss());
        for (const [name, pagePath, selector] of [['mypage','/mypage','button.rd-my-dl'], ['home','/#catalog','button.rd-paid']]) {
            scenario = 'paid';
            await page.goto(base + pagePath, { waitUntil: 'domcontentloaded', timeout: 90000 });
            console.log('LOADED', name, await page.evaluate(async () => ({ cookies: document.cookie.split(';').map(c => c.trim().split('=')[0]), locks: navigator.locks ? await navigator.locks.query() : null })));
            const button = page.locator(selector).first();
            await button.waitFor({ state: 'visible', timeout: 30000 });
            if (name === 'home') await page.getByRole('button', { name: '한글 파일 받기', exact: true }).waitFor({ timeout: 30000 });
            await button.scrollIntoViewIfNeeded();
            await page.screenshot({ path: path.join(output, `mobile-${label}-${name}.png`) });
            const responsePromise = page.waitForResponse(r => r.url().startsWith(base + '/api/download?'), { timeout: 30000 });
            const storagePromise = page.waitForResponse(r => r.url().includes('/storage/v1/object/sign/') && r.request().method() === 'GET', { timeout: 30000 });
            const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
            await button.click();
            const [response, storage, download] = await Promise.all([responsePromise, storagePromise, downloadPromise]);
            assert.equal(response.status(), 302);
            assert.equal(response.request().isNavigationRequest(), true);
            assert.match(response.headers()['content-disposition'], /^attachment;/);
            assert.match(storage.headers()['content-disposition'], /^attachment;/);
            const filename = '모바일검증고등학교_2026_1_2_중간고사_해설.hwpx';
            assert.equal(download.suggestedFilename(), filename);
            assert.equal(new URL(response.headers().location).searchParams.get('download'), filename);
            results.push({ ua: label, page: name, viewport: 390, serverPath: new URL(response.url()).pathname, navigation: true, redirect: response.status(), disposition: response.headers()['content-disposition'], finalStatus: storage.status(), finalDisposition: storage.headers()['content-disposition'], filename });
            console.log(JSON.stringify(results.at(-1)));
        }
        scenario = 'expired';
        assert.equal((await context.request.get(base + '/api/download?item=' + id, { maxRedirects: 0 })).status(), 410);
        scenario = 'unowned';
        assert.equal((await context.request.get(base + '/api/download?item=' + id, { maxRedirects: 0 })).status(), 403);
        scenario = 'cancelled';
        assert.equal((await context.request.get(base + '/api/download?item=' + id, { maxRedirects: 0 })).status(), 403);
        scenario = 'typing';
        assert.equal((await context.request.get(base + '/api/download?item=' + id, { maxRedirects: 0 })).status(), 302);
        await context.close();
    }
    // The two actual admin pages each submit one archive navigation; no popups.
    scenario = 'admin';
    const admin = await contextFor(safari);
    const adminPage = await admin.newPage();
    adminPage.on('dialog', dialog => dialog.dismiss());
    for (const [label,pagePath,selector] of [['raw','/admin/raw-uploads','button[title="다운로드 (3장)"]'],['db','/admin/db-requests','button[title="전체 받기 (3개)"]']]) {
        await adminPage.goto(base+pagePath,{waitUntil:'domcontentloaded',timeout:90000});
        const button=adminPage.locator(selector).first();await button.waitFor({state:'visible',timeout:30000});
        const downloading=adminPage.waitForEvent('download',{timeout:30000});
        const responding=adminPage.waitForResponse(r=>r.url().endsWith('/api/admin/material-archive'),{timeout:30000});
        const opened=admin.pages().length;await button.click();
        const [download,response]=await Promise.all([downloading,responding]);
        assert.equal(response.status(),200);assert.equal(response.request().method(),'POST');assert.equal(response.request().isNavigationRequest(),true);
        assert.equal(admin.pages().length,opened);assert.match(response.headers()['content-disposition'],/^attachment;/);
        const zip=await JSZip.loadAsync(fs.readFileSync(await download.path()));
        assert.equal(Object.keys(zip.files).length,3);
        for (const [i,name] of Object.keys(zip.files).entries()) assert.equal(await zip.file(name).async('string'),'ARCHIVE CONTENT: original_'+(i+1)+'.hwp');
        await adminPage.screenshot({path:path.join(output,'mobile-admin-'+label+'-archive.png')});
        results.push({ page:'admin-'+label, files:3, transport:'single POST ZIP', status:200, slowStorageMs:650, newWindows:0 });
    }
    // Hold an already-open page, simulate the next release, then refresh before SQL B.
    await adminPage.route('**/api/client-release',route=>route.fulfill({json:{release:'next-release-test'},headers:{'cache-control':'no-store'}}));
    await adminPage.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await adminPage.getByRole('dialog',{name:'사이트 업데이트 안내'}).waitFor({timeout:10000});
    await adminPage.unroute('**/api/client-release');
    await Promise.all([adminPage.waitForNavigation({waitUntil:'domcontentloaded'}),adminPage.getByRole('dialog',{name:'사이트 업데이트 안내'}).getByRole('button',{name:'새로고침',exact:true}).click()]);
    assert.equal(await adminPage.getByRole('dialog',{name:'사이트 업데이트 안내'}).count(),0);
    results.push({ page:'held-open-tab', releaseMismatch:'refresh required', refreshed:true });
    await admin.close();
    scenario = 'paid';
    const anon = await contextFor(safari, false);
    const denied = await anon.request.post(base+'/api/admin/material-archive',{form:{files:JSON.stringify(archiveFiles)}});
    assert.equal(denied.status(),401);
    const page = await anon.newPage();
    const response = await page.goto(base + '/api/download?item=' + id);
    assert.equal(response.status(), 401);
    assert.match(await page.locator('body').innerText(), /로그인 후/);
    await page.screenshot({ path: path.join(output, 'mobile-login-required.png') });
    await anon.close();
    fs.writeFileSync(path.join(output, 'mobile_results2.json'), JSON.stringify({ at: new Date().toISOString(), engine: 'Chromium with mobile/iOS Safari and NAVER UAs', auth: 'local fake Supabase, no production account', results, errors: { anonymous: 401, expired: 410, unowned: 403, unlimitedTyping: 302, cancelled:403, anonymousArchive:401 } }, null, 2));
})().catch(async e => {
    console.error(e.stack);
    console.error('LOCAL BACKEND CALLS:', JSON.stringify(calls.slice(-30)));
    for (const context of browser?.contexts() || []) for (const page of context.pages()) {
        console.error('PAGE:', page.url(), (await page.locator('body').innerText().catch(() => '')).slice(0,2000));
        await page.screenshot({ path: path.join(output, 'mobile-failure.png'), timeout: 5000 }).catch(() => {});
    }
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    if (next?.pid) {
        if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(next.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else next.kill('SIGTERM');
    }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); log.end();
});
