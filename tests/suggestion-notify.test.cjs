require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const choices = require('../src/lib/reportDoneNotice.ts');
const password = require('../src/lib/suggestion-password.ts');
const owner = { id: '00000000-0000-4000-8000-000000000001', email: 'owner@example.invalid' };
const adminUser = { id: '00000000-0000-4000-8000-000000000002', email: 'mathofhy@naver.com' };
const postId = '00000000-0000-4000-8000-000000000003';
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function load(file, deps, globals = {}) {
    const mod = { exports: {} };
    const code = ts.transpileModule(read('src/' + file), { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.React,
    } }).outputText;
    vm.runInNewContext(code, { module: mod, exports: mod.exports, Date, console, crypto: require('node:crypto'),
        setTimeout, ...globals, require(name) { if (name in deps) return deps[name]; throw Error('Unmocked import: ' + name); } });
    return mod.exports;
}

function componentHarness(file, user, fetch) {
    const React = require('react');
    const states = [], effects = [];
    let cursor = 0;
    const component = load(file, {
        react: { ...React, useState(initial) {
            const index = cursor++;
            if (!(index in states)) states[index] = initial;
            return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
        }, useEffect(fn) { effects.push(fn); } },
        'next/link': props => React.createElement('a', props),
        'next/navigation': { useRouter: () => ({ push() {}, replace() {} }), useParams: () => ({ id: postId }) },
        '@/components/Header': () => null,
        '@/utils/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
        '@/lib/reportDoneNotice': choices,
        'lucide-react': Object.fromEntries(['ArrowLeft','Lock','Clock','Eye','User','MessageSquare','Send','PenLine'].map(name => [name, () => null])),
    }, { fetch, alert: () => {} }).default;
    return { render() { cursor = 0; return component(); },
        async mount() { this.render(); await effects.shift()(); await new Promise(resolve => setImmediate(resolve)); return this.render(); } };
}
function nodes(tree, predicate) {
    if (!tree || typeof tree !== 'object') return [];
    if (Array.isArray(tree)) return tree.flatMap(t => nodes(t, predicate));
    return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

test('글쓰기 실제 컴포넌트: 기본 체크와 선택 시간 저장, 해제 시 선택창 숨김·미발송', async () => {
    for (const checked of [true, false]) {
        const h = await harness(); try {
            let saved;
            const ui = componentHarness('app/suggestion/write/page.tsx', { ...owner, user_metadata: { phone: '01000000000' } }, async (url, opts) => {
                assert.equal(url, '/api/suggestions'); saved = JSON.parse(opts.body);
                const r = await h.create(saved.notify); return { ok: r.status === 200, status: r.status, json: async () => r.body };
            });
            let tree = await ui.mount();
            const checkbox = nodes(tree, n => n.props?.type === 'checkbox')[0];
            assert.equal(checkbox.props.checked, true);
            nodes(tree, n => n.props?.id === 'suggestion-title')[0].props.onChange({ target: { value: '제목' } });
            nodes(tree, n => n.props?.id === 'suggestion-content')[0].props.onChange({ target: { value: '본문' } });
            nodes(tree, n => n.type === 'select')[0].props.onChange({ target: { value: 'evening' } });
            if (!checked) checkbox.props.onChange({ target: { checked: false } });
            tree = ui.render();
            assert.equal(nodes(tree, n => n.type === 'select').length, checked ? 1 : 0);
            await nodes(tree, n => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
            assert.deepEqual(saved.notify, { sms: checked, when: 'evening' });
            assert.deepEqual((await h.row()).notify, saved.notify);
            assert.equal((await h.reply()).body.sms, checked ? 'sent' : 'not_requested');
        } finally { await h.db.close(); }
    }
});

test('글쓰기 실제 컴포넌트: 번호 없음 안내, 번호 자체 비노출, auth.phone 대체값 지원', async () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    for (const account of [{ ...owner, user_metadata: {} }, { ...owner, user_metadata: {}, phone: '01000000000' }]) {
        const ui = componentHarness('app/suggestion/write/page.tsx', account, () => { throw Error('must not submit'); });
        const tree = await ui.mount();
        const html = renderToStaticMarkup(tree);
        assert.ok(!html.includes('01000000000'));
        assert.equal(html.includes('휴대폰 번호가 없어 문자 알림을 받을 수 없어요'), !account.phone);
        assert.equal(nodes(tree, n => n.props?.type === 'checkbox').length, account.phone ? 1 : 0);
    }
});

test('관리자 실제 컴포넌트: 답변 저장 결과를 문자 상태 한 줄로 표시', async () => {
    const { renderToStaticMarkup } = require('react-dom/server');
    for (const [sms, label] of Object.entries({sent:'보냄',scheduled:'예약',no_phone:'번호 없음',failed:'실패',not_requested:'알림 안 받음',already_notified:'이미 처리됨 (재발송 안 함)'})) {
        const ui = componentHarness('app/suggestion/[id]/page.tsx', adminUser, async (_url, opts) => ({ ok: true,
            json: async () => opts?.method === 'POST' ? { admin_reply: '답변', sms } : {
                post: { id: postId, title: '건의', content: '본문', created_at: new Date().toISOString() }, unlocked: true, isAdmin: true,
            } }));
        let tree = await ui.mount();
        nodes(tree, n => n.type === 'button' && n.props?.className === 'rd-btn rd-btn-tint rd-btn-sm')[0].props.onClick();
        tree = ui.render();
        nodes(tree, n => n.type === 'textarea')[0].props.onChange({ target: { value: '답변' } });
        tree = ui.render();
        await nodes(tree, n => n.type === 'button' && n.props?.className === 'rd-btn rd-btn-primary')[0].props.onClick();
        assert.ok(renderToStaticMarkup(ui.render()).includes('문자: ' + label));
    }
});

async function harness({ migrated = true, missingCode = '42703' } = {}) {
    const db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE suggestions(id uuid PRIMARY KEY DEFAULT '${postId}', title text, content text, password text,
        author_id uuid, author_nickname text, created_at timestamptz DEFAULT now(), views int DEFAULT 0,
        admin_reply text, admin_replied_at timestamptz);
        GRANT SELECT, INSERT, UPDATE, DELETE ON suggestions TO anon, authenticated, service_role;`);
    await db.exec(read('migration_suggestions_rls.sql'));
    const policiesBefore = (await db.query("SELECT * FROM pg_policies WHERE tablename='suggestions'")).rows;
    if (migrated) await db.exec(read('supabase/migrations/20261110_suggestion_notify.sql'));
    const state = { user: owner, sends: [], result: 'sent', phone: '01000000000', sql: [], authError: false, errors: [] };
    const admin = { auth: { admin: { async getUserById(id) {
        assert.equal(id, owner.id);
        return state.authError ? { error: Error('auth unavailable') } : { data: { user: { user_metadata: { phone: state.phone } } } };
    } } }, from(table) {
        assert.equal(table, 'suggestions');
        let fields = null, mutation, insertion, filters = [], single = false, ordering = '';
        const query = {
            select(s) { fields = s; return this; },
            insert(row) { insertion = row; return this; },
            update(row) { mutation = row; return this; },
            eq(k,v) { filters.push([k, v]); return this; },
            is(k,v) { assert.equal(v, null); filters.push([k, null]); return this; },
            order() { ordering = ' ORDER BY created_at DESC'; return this; },
            maybeSingle() { single = true; return this; }, single() { single = true; return this; },
            async then(resolve, reject) {
                const args = [];
                const parameter = v => { args.push(v); return '$' + args.length; };
                let sql;
                if (insertion) sql = `INSERT INTO suggestions (${Object.keys(insertion).join(',')}) VALUES (${Object.values(insertion).map(parameter).join(',')})`;
                else if (mutation) sql = 'UPDATE suggestions SET ' + Object.entries(mutation).map(([k,v]) => k + '=' + parameter(v)).join(',');
                else sql = 'SELECT ' + fields + ' FROM suggestions';
                if (filters.length) sql += ' WHERE ' + filters.map(([k,v]) => v === null ? `${k} IS NULL` : `${k}=${parameter(v)}`).join(' AND ');
                if ((mutation || insertion) && fields) sql += ' RETURNING ' + fields;
                sql += ordering;
                state.sql.push(sql);
                if (mutation?.reply_notified_at === null && state.releaseError) {
                    if (state.releaseError === 'throw') return reject(Error('release unavailable'));
                    return resolve({ data: null, error: { code: 'XX000', message: 'release unavailable' } });
                }
                try {
                    const out = await db.query(sql, args);
                    return resolve({ data: single ? out.rows[0] || null : out.rows, error: null });
                } catch (e) {
                    return resolve({ data: null, error: { code: e.code === '42703' ? missingCode : e.code, message: e.message } });
                }
            },
        };
        return query;
    } };
    const deps = {
        '@/utils/supabase/server-admin': { createAdminClient: () => admin },
        '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }) },
        '@/lib/reportDoneNotice': choices,
        '@/lib/suggestion-password': password,
        '@/lib/sms': { async sendNotice(phone, text, opts) {
            state.sends.push({ phone, text, opts });
            if (state.onSend) await state.onSend();
            if (state.throwSend) throw Error('provider unavailable');
            return phone ? state.result : 'no_phone';
        } },
        'next/server': { NextResponse: { json: (body, opts) => ({ body, status: opts?.status || 200 }) } },
    };
    const notices = load('lib/suggestionNotice.ts', deps, {
        console: { ...console, error: (...args) => state.errors.push(args) },
    });
    deps['@/lib/suggestionNotice'] = notices;
    const collection = load('app/api/suggestions/route.ts', deps);
    const reply = load('app/api/suggestions/[id]/reply/route.ts', deps);
    const detail = load('app/api/suggestions/[id]/route.ts', deps);
    const verify = load('app/api/suggestions/[id]/verify/route.ts', deps);
    const request = body => ({ json: async () => body });
    return { db, state, policiesBefore, notices,
        create: (notify = { sms: true, when: 'asap' }) => collection.POST(request({ title: '새로운 건의', content: '건의 본문', password: 'secret', notify })),
        async reply(text = '답변입니다') { state.user = adminUser; return reply.POST(request({ reply: text }), { params: { id: postId } }); },
        detail: () => detail.GET({}, { params: { id: postId } }),
        verify: () => verify.POST(request({ password: 'secret' }), { params: { id: postId } }),
        list: () => collection.GET(),
        row: async () => (await db.query('SELECT * FROM suggestions')).rows[0],
    };
}

test('기본 체크 선택 저장, 검증된 시간 선택 재사용, 기본값 누락은 미신청', async () => {
    const h = await harness(); try {
        assert.match(read('src/app/suggestion/write/page.tsx'), /\[notifySms, setNotifySms\] = useState\(true\)/);
        assert.equal((await h.create()).status, 200);
        assert.deepEqual((await h.row()).notify, { sms: true, when: 'asap' });
        assert.equal((await h.row()).reply_notified_at, null);
        assert.equal(h.notices.missingSuggestionNotify({ code: '42703', message: 'column another_field does not exist' }), false);
        assert.equal(h.notices.missingSuggestionNotify({ code: '42501', message: 'notify permission' }), false);
    } finally { await h.db.close(); }
});

test('체크 해제 및 레거시 NULL은 미발송, 빈 답변은 선점하지 않음', async () => {
    const h = await harness(); try {
        await h.create({ sms: false, when: 'asap' });
        assert.equal((await h.reply()).body.sms, 'not_requested');
        await h.db.exec('UPDATE suggestions SET notify=NULL');
        assert.equal((await h.reply()).body.sms, 'not_requested');
        await h.db.exec(`UPDATE suggestions SET notify='{"sms":true,"when":"asap"}'`);
        assert.equal((await h.reply('   ')).body.sms, 'empty_reply');
        assert.equal((await h.row()).reply_notified_at, null);
        assert.equal(h.state.sends.length, 0);
    } finally { await h.db.close(); }
});

test('첫 답변 1회 발송, 수정·삭제 후 재작성도 재발송 없음', async () => {
    const h = await harness(); try {
        await h.create();
        assert.equal((await h.reply()).body.sms, 'sent');
        assert.ok((await h.row()).reply_notified_at);
        assert.equal((await h.reply('수정')).body.sms, 'already_notified');
        await h.reply(''); await h.reply('재작성');
        assert.equal(h.state.sends.length, 1);
        assert.equal(h.state.sends[0].text, '[수학ETF] 남겨 주신 건의사항「새로운 건의」에 답변이 달렸습니다. 수학ETF 건의사항에서 확인해 주세요.');
        assert.equal(h.state.sends[0].opts.at, null);
    } finally { await h.db.close(); }
});

test('동시 두 답변 저장에서 SQL 조건부 UPDATE 선점 1회', async () => {
    const h = await harness(); try {
        await h.create();
        const result = await Promise.all([h.reply(), h.reply()]);
        assert.deepEqual(result.map(r => r.body.sms).sort(), ['already_notified', 'sent']);
        assert.equal(h.state.sends.length, 1);
        assert.ok(h.state.sql.some(s => /UPDATE.*reply_notified_at.*IS NULL.*RETURNING id/.test(s)));
    } finally { await h.db.close(); }
});

test('failed 및 예외는 선점 복구 후 재시도, no_phone은 재시도하지 않음', async () => {
    for (const failure of ['failed', 'throw', 'auth']) {
        const h = await harness(); try {
            await h.create(); h.state.result = failure === 'failed' ? 'failed' : 'sent';
            h.state.throwSend = failure === 'throw'; h.state.authError = failure === 'auth';
            assert.equal((await h.reply()).body.sms, 'failed');
            assert.equal((await h.row()).reply_notified_at, null);
            h.state.result = 'sent'; h.state.throwSend = false; h.state.authError = false;
            assert.equal((await h.reply()).body.sms, 'sent');
        } finally { await h.db.close(); }
    }
    const h = await harness(); try {
        await h.create(); h.state.phone = null;
        assert.equal((await h.reply()).body.sms, 'no_phone');
        assert.ok((await h.row()).reply_notified_at);
        assert.equal((await h.reply()).body.sms, 'already_notified');
        assert.equal(h.state.sends.length, 1);
    } finally { await h.db.close(); }
});

test('발송 실패 후 선점 해제 UPDATE도 실패하면 로그만 남기고 저장 성공 유지', async () => {
    for (const releaseError of ['error', 'throw']) {
        const h = await harness(); try {
            await h.create(); h.state.result = 'failed'; h.state.releaseError = releaseError;
            const result = await h.reply();
            assert.equal(result.status, 200);
            assert.equal(result.body.sms, 'failed');
            assert.equal((await h.row()).admin_reply, '답변입니다');
            assert.ok((await h.row()).reply_notified_at);
            assert.equal(h.state.errors.length, 1);
            assert.match(h.state.errors[0][0], /선점 해제 실패/);
            assert.ok(!JSON.stringify(h.state.errors).includes(h.state.phone));
            assert.equal((await h.reply('수정')).body.sms, 'already_notified');
            assert.equal(h.state.sends.length, 1);
        } finally { await h.db.close(); }
    }
});

test('예약 결과와 기존 notifySendAt 재사용, 문구 제목 20자 및 빈 제목', async () => {
    const h = await harness(); try {
        await h.create({ sms: true, when: 'morning' }); h.state.result = 'scheduled';
        assert.equal((await h.reply()).body.sms, 'scheduled');
        const actual = h.state.sends[0].opts.at, expected = choices.notifySendAt('morning');
        assert.equal(actual?.toISOString() ?? null, expected?.toISOString() ?? null);
        const title = '😀'.repeat(25);
        assert.ok(h.notices.suggestionReplyText(title).includes('「' + '😀'.repeat(20) + '」'));
        assert.equal(h.notices.suggestionReplyText('  '), '[수학ETF] 남겨 주신 건의사항에 답변이 달렸습니다. 수학ETF 건의사항에서 확인해 주세요.');
    } finally { await h.db.close(); }
});

test('42703/PGRST204 컬럼 없는 DB에서 insert/select 재시도하고 답변은 정상 저장', async () => {
    for (const missingCode of ['42703', 'PGRST204']) {
        const h = await harness({ migrated: false, missingCode }); try {
            assert.equal((await h.create()).status, 200);
            const r = await h.reply(); assert.equal(r.status, 200); assert.equal(r.body.sms, 'unavailable');
            assert.equal((await h.row()).admin_reply, '답변입니다');
            assert.equal((await h.detail()).status, 200);
            assert.equal(h.state.sends.length, 0);
            assert.ok(h.state.sql.some(s => s === `SELECT id, admin_reply FROM suggestions WHERE id=$1`));
        } finally { await h.db.close(); }
    }
});

test('남의 글 상세·목록·비밀번호 확인에 notify 노출 없음, 비관리자 답변 금지', async () => {
    const h = await harness(); try {
        await h.create();
        h.state.user = { id: adminUser.id, email: 'other@example.invalid' };
        const detail = await h.detail(); assert.equal(detail.body.unlocked, false);
        assert.equal(detail.body.post.title, '비밀글입니다');
        const listing = await h.list(); assert.equal(listing.body.items.length, 0);
        for (const response of [detail, listing, await h.verify()]) {
            assert.ok(!JSON.stringify(response.body).includes('notify'));
            assert.ok(!JSON.stringify(response.body).includes('reply_notified_at'));
        }
        const route = load('app/api/suggestions/[id]/reply/route.ts', {
            '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: owner } }) } }) },
            '@/utils/supabase/server-admin': { createAdminClient: () => { throw Error('must not access DB'); } },
            '@/lib/suggestionNotice': h.notices,
            'next/server': { NextResponse: { json: (body, opts) => ({ body, status: opts?.status || 200 }) } },
        });
        assert.equal((await route.POST({}, { params: { id: postId } })).status, 403);
    } finally { await h.db.close(); }
});

test('마이그레이션 기존 행 NULL, RLS·권한 유지, anon/authenticated 남의 알림 조회 불가', async () => {
    const h = await harness({ migrated: false }); try {
        await h.create();
        const privileges = () => h.db.query("SELECT relacl::text acl, relrowsecurity rls FROM pg_class WHERE oid='suggestions'::regclass");
        const before = (await privileges()).rows;
        await h.db.exec(read('supabase/migrations/20261110_suggestion_notify.sql'));
        assert.deepEqual((await privileges()).rows, before);
        assert.deepEqual((await h.db.query("SELECT * FROM pg_policies WHERE tablename='suggestions'")).rows, h.policiesBefore);
        assert.equal((await h.row()).notify, null); assert.equal((await h.row()).reply_notified_at, null);
        await h.db.exec(`UPDATE suggestions SET notify='{"sms":true,"when":"asap"}'`);
        for (const role of ['anon', 'authenticated']) {
            await h.db.exec('SET ROLE ' + role);
            assert.equal((await h.db.query('SELECT notify, reply_notified_at FROM suggestions')).rows.length, 0);
            await h.db.exec('RESET ROLE');
        }
        // 재적용해도 기존 알림 선택과 선점값 유지.
        await h.db.exec(read('supabase/migrations/20261110_suggestion_notify.sql'));
        assert.equal((await h.row()).notify.sms, true);
    } finally { await h.db.close(); }
});

test('기존 공개 SELECT 정책 또는 RLS 비활성 DB에서는 권한 변경 없이 마이그레이션 중단', async () => {
    for (const unsafe of ['ALTER TABLE suggestions DISABLE ROW LEVEL SECURITY',
        'CREATE POLICY legacy_public_read ON suggestions FOR SELECT USING (true)']) {
        const h = await harness({ migrated: false }); try {
            await h.db.exec(unsafe);
            await assert.rejects(h.db.exec(read('supabase/migrations/20261110_suggestion_notify.sql')), /privacy lockdown required/);
            await h.db.exec('ROLLBACK');
            const cols = await h.db.query("SELECT column_name FROM information_schema.columns WHERE table_name='suggestions' AND column_name='notify'");
            assert.equal(cols.rows.length, 0);
        } finally { await h.db.close(); }
    }
});
