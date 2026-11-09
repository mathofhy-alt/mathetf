require('./register.cjs');
const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const React = require('react');
const { DRAFT_KEY, draftContext, shouldRestoreDraft } = require('../src/lib/questions/draft.ts');
const { answerExamTitle } = require('../src/lib/role-cta.ts');

const src = '오금고등학교_2025_1학기중간_공통수학1';
const params = extra => new URLSearchParams({ src, origin: 'free-pdf', ...extra });
const originalParams = params({ intent: 'answer' });
const similarParams = params({ variant: 'similar1' });
const question = id => ({ id, source_db_id: src, school: '오금고등학교', year: 2025, grade: 1,
    semester: '1학기중간', subject: '공통수학1', question_images: [] });
const originals = ['original-1', 'original-2'].map(question);
const similar = ['similar-1', 'similar-2'].map(question);
const draft = (entry, extra = {}) => ({ version: 1, updatedAt: Date.now(), entryContext: draftContext(entry),
    cartIds: similar.map(q => q.id), selectedDbIds: [], excludedQuestionIds: [], selectedExamIds: [], filters: null,
    title: '유사문제 작업', questionsPerColumn: 2, viewMode: 'review', autoOpen: false, ...extra });
const storage = saved => new Map(saved ? [[DRAFT_KEY, JSON.stringify(saved)]] : []);

// Execute the actual page and all its effects with isolated browser/auth/network boundaries.
// State, refs, memoization, dependencies and cleanup survive renders just as hooks do.
function hookRuntime() {
    const slots = [];
    let cursor = 0, dirty = true;
    const changed = (prev, next) => !prev || !next || prev.length !== next.length || prev.some((v, i) => !Object.is(v, next[i]));
    const react = { ...React,
        useState(initial) {
            const i = cursor++;
            slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
            return [slots[i].value, update => {
                const value = typeof update === 'function' ? update(slots[i].value) : update;
                if (!Object.is(slots[i].value, value)) { slots[i].value = value; dirty = true; }
            }];
        },
        useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
        useMemo(fn, deps) {
            const i = cursor++;
            if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { value: fn(), deps };
            return slots[i].value;
        },
        useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
        useEffect(fn, deps) {
            const i = cursor++;
            if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { fn, deps, cleanup: slots[i]?.cleanup, pending: true };
        },
    };
    return { react, get dirty() { return dirty; },
        render(fn) {
            cursor = 0; dirty = false;
            const tree = fn();
            for (const slot of slots) if (slot.pending) {
                slot.pending = false; slot.cleanup?.(); slot.cleanup = slot.fn();
            }
            return tree;
        },
        cleanup() { slots.forEach(slot => slot.cleanup?.()); },
    };
}
const pageFile = path.join(__dirname, '../src/app/question-bank/page.tsx');
const pageCode = ts.transpileModule(fs.readFileSync(pageFile, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function pageHarness(entry, saved = storage()) {
    const runtime = hookRuntime(), components = new Map(), requests = [];
    const member = { id: 'self', email: 'preview@mathetf.invalid' };
    const supabase = { auth: { getUser: async () => ({ data: { user: member } }) },
        from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: null }) }) };
    const passInfo = { info: null, refresh: async () => {}, setInfo() {} };
    const deps = {
        react: runtime.react,
        '@/utils/supabase/client': { createClient: () => supabase },
        '@/lib/usePassInfo': { usePassInfo: () => passInfo },
        '@/lib/analytics/question-bank': { logQuestionBankEvent() {}, questionBankSession: () => 'test-session' },
        '@/lib/pdfDownload': { downloadExamPdf() { throw Error('PDF conversion must not run'); } },
        '@/lib/similarPrefetch': { prefetchSimilar() {} },
    };
    const mod = { exports: {} };
    vm.runInNewContext(pageCode, { module: mod, exports: mod.exports, console, URLSearchParams, process,
        setTimeout: () => 1, clearTimeout() {},
        window: { location: { search: '?' + entry, href: 'https://mathetf.invalid/question-bank?' + entry }, innerWidth: 390 },
        document: { body: { style: {} }, addEventListener() {}, removeEventListener() {} },
        localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
        fetch: async (url, options) => {
            const body = options?.body ? JSON.parse(options.body) : undefined;
            requests.push({ url, body });
            let data;
            if (url === '/api/questions/by-ids') {
                if (body.src) data = { success: true, data: body.variant ? similar : originals };
                else data = { success: true, data: [...originals, ...similar].filter(q => body.ids.includes(q.id)).reverse() };
            } else if (url === '/api/questions/facets') data = { success: true, count: 4, schoolCount: 1 };
            else if (url === '/api/questions/catalog') data = { success: true, data: [] };
            else if (url.startsWith('/api/storage/folders?')) data = { folders: [], items: [] };
            else if (url === '/api/log/feature') data = { success: true };
            else throw Error('Unexpected request: ' + url);
            return { ok: true, json: async () => data };
        },
        require(name) {
            if (name in deps) return deps[name];
            if (name.startsWith('@/components/')) {
                if (!components.has(name)) components.set(name, () => null);
                return { __esModule: true, default: components.get(name), passLine: () => '' };
            }
            return require(name.startsWith('@/') ? path.join(__dirname, '../src', name.slice(2) + '.ts') : name);
        },
    });
    let tree;
    return { requests, saved, cleanup: () => runtime.cleanup(),
        async settle() {
            for (let i = 0; i < 12; i++) {
                if (runtime.dirty) tree = runtime.render(() => mod.exports.default());
                await new Promise(resolve => setImmediate(resolve));
                if (!runtime.dirty) return tree;
            }
            throw Error('Page did not settle');
        },
        find(name) {
            const visit = node => {
                if (!node || typeof node !== 'object') return null;
                if (node.type === components.get('@/components/' + name)) return node;
                for (const child of React.Children.toArray(node.props?.children)) {
                    const found = visit(child); if (found) return found;
                }
                return null;
            };
            return visit(tree);
        },
    };
}

test('draft identity separates source, variant and intent while ignoring origin and parameter order', () => {
    const entries = [params({}), similarParams, originalParams, params({ intent: 'answer', variant: 'similar1' }), params({ variant: '' })];
    a.equal(new Set(entries.map(draftContext)).size, entries.length);
    const reordered = new URLSearchParams({ intent: 'answer', origin: 'guide', src });
    a.equal(draftContext(reordered), draftContext(originalParams));
    a.equal(shouldRestoreDraft(draft(originalParams), reordered), true);
    for (const other of entries.filter(p => p !== originalParams)) {
        a.equal(shouldRestoreDraft(draft(other), originalParams), false);
        a.equal(shouldRestoreDraft(draft(originalParams), other), false);
    }
});

test('answer entry rejects ambiguous legacy drafts and resume cannot bypass the identity check', () => {
    const legacy = draft(params({}));
    for (const entryContext of [legacy.entryContext, undefined]) {
        const saved = { ...legacy, entryContext };
        a.equal(shouldRestoreDraft(saved, originalParams), false);
        a.equal(shouldRestoreDraft(saved, params({ intent: 'answer', resume: '1' })), false);
        a.equal(shouldRestoreDraft(saved, new URLSearchParams('resume=1')), true);
        a.equal(shouldRestoreDraft(saved, new URLSearchParams()), true);
    }
    a.equal(shouldRestoreDraft(draft(similarParams), params({ intent: 'answer', resume: '1' })), false);
    a.equal(shouldRestoreDraft(draft(originalParams), params({ intent: 'answer', resume: '1' })), true);
});

test('actual page effects replace a persisted similar draft with originals on answer entry', async t => {
    const sharedStorage = storage();
    const first = pageHarness(similarParams, sharedStorage); t.after(first.cleanup);
    await first.settle();
    a.deepEqual(JSON.parse(sharedStorage.get(DRAFT_KEY)).cartIds, similar.map(q => q.id));
    a.equal(first.find('question-bank/AnswerPdfBanner'), null);
    const answer = pageHarness(originalParams, sharedStorage); t.after(answer.cleanup);
    await answer.settle();
    a.deepEqual(answer.requests.filter(r => r.url === '/api/questions/by-ids').map(r => r.body), [{ src }]);
    a.deepEqual(JSON.parse(sharedStorage.get(DRAFT_KEY)).cartIds, originals.map(q => q.id));
    const banner = answer.find('question-bank/AnswerPdfBanner'); a.ok(banner); a.equal(banner.props.disabled, false);
    banner.props.onGenerate(); await answer.settle();
    a.equal(answer.find('question-bank/ConfigModal').props.initialTitle, answerExamTitle(src, originals[0]));
});

test('actual answer effects refill originals for legacy, unscoped, different-paper and login-return drafts', async t => {
    for (const saved of [null, draft(originalParams, { cartIds: [] }),
        draft(params({})), draft(params({}), { entryContext: undefined }),
        draft(params({ src: 'another-paper', intent: 'answer' })), draft(similarParams)]) {
        for (const resume of [false, true]) {
            const entry = params({ intent: 'answer', ...(resume ? { resume: '1' } : {}) });
            const h = pageHarness(entry, storage(saved)); t.after(h.cleanup);
            await h.settle();
            a.deepEqual(h.requests.filter(r => r.url === '/api/questions/by-ids').map(r => r.body), [{ src }]);
            a.deepEqual(JSON.parse(h.saved.get(DRAFT_KEY)).cartIds, originals.map(q => q.id));
            a.ok(h.find('question-bank/AnswerPdfBanner'));
        }
    }
});

test('actual answer effects restore the matching answer draft order and custom title without refilling', async t => {
    for (const resume of [false, true]) {
        const cartIds = originals.map(q => q.id).reverse(), title = '직접 입력한 정답 제목';
        const h = pageHarness(params({ intent: 'answer', ...(resume ? { resume: '1' } : {}) }),
            storage(draft(originalParams, { cartIds, title }))); t.after(h.cleanup);
        await h.settle();
        a.deepEqual(h.requests.filter(r => r.url === '/api/questions/by-ids').map(r => r.body), [{ ids: cartIds }]);
        a.deepEqual(JSON.parse(h.saved.get(DRAFT_KEY)).cartIds, cartIds);
        h.find('question-bank/AnswerPdfBanner').props.onGenerate(); await h.settle();
        a.equal(h.find('question-bank/ConfigModal').props.initialTitle, title);
    }
});

test('actual page effects preserve matching teacher and similar drafts without a competing refill or answer banner', async t => {
    for (const entry of [params({}), similarParams]) {
        const cartIds = (entry.has('variant') ? similar : originals).map(q => q.id).reverse();
        const title = '이어서 편집할 제목';
        const h = pageHarness(entry, storage(draft(entry, { cartIds, title }))); t.after(h.cleanup);
        await h.settle();
        a.deepEqual(h.requests.filter(r => r.url === '/api/questions/by-ids').map(r => r.body), [{ ids: cartIds }]);
        const persisted = JSON.parse(h.saved.get(DRAFT_KEY));
        a.deepEqual(persisted.cartIds, cartIds); a.equal(persisted.title, title);
        a.equal(h.find('question-bank/AnswerPdfBanner'), null);
    }
});
