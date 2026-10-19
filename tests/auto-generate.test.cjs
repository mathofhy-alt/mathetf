const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Replace all server dependencies so these tests cannot connect to a database.
function routeHarness(respond) {
    let now = 1_000_000;
    const calls = [];
    const file = path.join(__dirname, '../src/app/api/pro/auto-generate/route.ts');
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const routeModule = { exports: {} };
    vm.runInNewContext(code, {
        module: routeModule, exports: routeModule.exports, Date: { now: () => now },
        require(name) {
            if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
            if (name.endsWith('/server')) return { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) } }) };
            if (name.endsWith('/server-admin')) return { createAdminClient: () => ({ rpc: async (name, args) => {
                calls.push({ name, args });
                return respond(name, args);
            } }) };
            if (name.endsWith('/fastScope')) return { resolveRequestScope: async () => ({ scope: [{ sources: ['test'] }] }) };
            if (name.endsWith('/order')) return { uuidPattern: /^[0-9a-f-]{36}$/i };
            throw new Error(`Unexpected import: ${name}`);
        },
    }, { filename: file });
    return {
        calls,
        advance(ms) { now += ms; },
        post(body = {}) {
            return routeModule.exports.POST({ json: async () => ({ count: 12, minDifficulty: 1, maxDifficulty: 10, ...body }) });
        },
    };
}

const typed = 'question_bank_random_typed';
const legacy = 'question_bank_random';
const plain = value => JSON.parse(JSON.stringify(value));

test('Typed generation forwards the filters and preserves question order and type metadata', async () => {
    const data = {
        questions: [{ id: 'second', type_code: 'A' }, { id: 'first', type_code: 'B' }],
        availableCount: 40, typeCount: 2,
    };
    const h = routeHarness(() => ({ data, error: null }));
    const result = await h.post({
        subject: '수학', unit: ['다항식'], minDifficulty: 3, maxDifficulty: 7,
        excludedQuestionIds: ['11111111-1111-1111-1111-111111111111'], includeOffCurriculum: true,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(plain(result.body), { ...data, requestedCount: 12 });
    assert.deepEqual(plain(h.calls), [{ name: typed, args: {
        p_scope: [{ sources: ['test'] }], p_excluded: ['11111111-1111-1111-1111-111111111111'],
        p_subject: '수학', p_units: ['다항식'], p_min: 3, p_max: 7, p_count: 12, p_include_off: true,
    } }]);
});

test('Only missing-function errors fall back, remembering the absence for ten minutes', async () => {
    for (const error of [
        { code: 'PGRST202', message: 'Function not found' },
        { code: '42883', message: 'function public.question_bank_random_typed does not exist' },
    ]) {
        let missing = true;
        const h = routeHarness(name => name === typed && missing
            ? { data: null, error }
            : { data: { questions: [], availableCount: 0 }, error: null });
        const first = await h.post();
        assert.equal(first.status, 200);
        assert.equal(first.body.typeCount, undefined);
        assert.deepEqual(h.calls.map(c => c.name), [typed, legacy]);
        assert.deepEqual(plain(h.calls[0].args), plain(h.calls[1].args));
        assert.equal(h.calls[0].args.p_include_off, false);

        missing = false;
        h.advance(599_999);
        await h.post();
        assert.equal(h.calls.at(-1).name, legacy);
        h.advance(1);
        await h.post();
        assert.equal(h.calls.at(-1).name, typed);
    }
});

test('Other errors keep the existing failure response and do not cache a fallback', async () => {
    for (const error of [
        { code: '57014', message: 'statement timeout' },
        { code: '42501', message: 'permission denied' },
    ]) {
        const h = routeHarness(() => ({ data: null, error }));
        const result = await h.post();
        assert.equal(result.status, 400);
        assert.equal(result.body.error, '자동 출제를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
        await h.post();
        assert.deepEqual(h.calls.map(c => c.name), [typed, typed]);
    }
});

test('A failed legacy retry retains the existing failure response', async () => {
    const h = routeHarness(name => ({ data: null, error: name === typed
        ? { code: 'PGRST202' }
        : { code: '57014', message: 'statement timeout' } }));
    const result = await h.post();
    assert.equal(result.status, 400);
    assert.equal(result.body.error, '자동 출제를 완료하지 못했습니다. 잠시 후 다시 시도해주세요.');
    assert.deepEqual(h.calls.map(c => c.name), [typed, legacy]);
});
