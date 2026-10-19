require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const groups = require('../src/lib/questions/type-groups.ts');

// Route imports are replaced before evaluation: these tests cannot connect to a DB.
function routeHarness({ search, definitions = [], definitionsError = null, whole = false, wholeExcluded = ['excluded'] } = {}) {
    let now = 1_000_000;
    const calls = [];
    const errors = [];
    const sb = {
        rpc(name, args, options) { return query({ name, args, options }, search); },
        from(name) { return query({ name }, call => {
            const range = call.steps.find(s => s[0] === 'range');
            return { data: range ? definitions.slice(range[1], range[2] + 1) : definitions, error: definitionsError };
        }); },
    };
    function query(call, respond = () => ({ data: [], error: null, count: 0 })) {
        call.steps = [];
        calls.push(call);
        const builder = {};
        for (const method of ['select', 'returns', 'in', 'order', 'range', 'eq', 'overlaps', 'ilike']) {
            builder[method] = (...args) => { call.steps.push([method, ...args]); return builder; };
        }
        builder.then = (resolve, reject) => Promise.resolve().then(() => respond(call)).then(resolve, reject);
        return builder;
    }
    const file = path.join(__dirname, '../src/app/api/questions/search/route.ts');
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const routeModule = { exports: {} };
    vm.runInNewContext(code, {
        module: routeModule, exports: routeModule.exports, Date: { now: () => now },
        console: { error: (...args) => errors.push(args) },
        require(name) {
            if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
            if (name.endsWith('/server-admin')) return { createAdminClient: () => sb };
            if (name.endsWith('/type-groups')) return groups;
            if (name.endsWith('/fastScope')) return {
                resolveRequestScope: async () => ({ catalog: [], scope: [{ sources: ['test'] }] }),
                isWholeCatalog: () => whole,
                wholeCatalogIneligible: async () => wholeExcluded,
            };
            throw new Error(`Unexpected import: ${name}`);
        },
    }, { filename: file });
    return {
        calls, errors,
        advance(ms) { now += ms; },
        post(body = {}) {
            return routeModule.exports.POST({ headers: { get: () => 'test' }, json: async () => ({ selectedDbs: ['test'], ...body }) });
        },
    };
}
const steps = (call, method) => call.steps.filter(s => s[0] === method);
const plain = value => JSON.parse(JSON.stringify(value));
const modern = call => steps(call, 'select')[0][1].includes('type_code');

test('Type ordering uses the typed RPC with scope, exclusions, count, and both off-curriculum filters', async () => {
    const userExcluded = ['11111111-1111-1111-1111-111111111111'];
    for (const { whole, wholeExcluded } of [
        { whole: false, wholeExcluded: ['excluded'] },
        { whole: true, wholeExcluded: ['excluded'] },
        { whole: true, wholeExcluded: [] },
        { whole: true, wholeExcluded: null },
    ]) {
        const h = routeHarness({ whole, wholeExcluded });
        const result = await h.post({ excludedQuestionIds: [...userExcluded, 'invalid', null] });
        assert.equal(result.status, 200);
        const call = h.calls[0];
        assert.equal(call.name, 'question_bank_typed');
        assert.deepEqual(plain(call.args), {
            p_scope: [{ sources: ['test'] }],
            p_excluded: whole && wholeExcluded ? [...wholeExcluded, ...userExcluded] : userExcluded,
            p_all: whole && !!wholeExcluded,
        });
        assert.deepEqual(plain(call.options), { count: 'estimated' });
        assert.ok(modern(call));
        assert.ok(steps(call, 'select')[0][1].endsWith(', type_sort, type_code'));
        assert.deepEqual(plain(steps(call, 'in')), [['in', 'work_status', ['sorted', 'private']]]);
        assert.deepEqual(plain(steps(call, 'range')), [['range', 0, 49]]);
        assert.deepEqual(plain(steps(call, 'order')), [
            ['order', 'type_sort', { ascending: true, nullsFirst: false }],
            ['order', 'question_number', { ascending: true }], ['order', 'id', { ascending: true }],
        ]);
        assert.deepEqual(plain(steps(call, 'eq')), [['eq', 'is_off_curriculum', false], ['eq', 'type_offcur', false]]);
        assert.deepEqual(plain(result.body.typeDefs), {});
    }
});

test('Exam order uses only the original RPC, columns, ordering, and off-curriculum filter', async () => {
    const userExcluded = ['11111111-1111-1111-1111-111111111111'];
    for (const whole of [false, true]) {
        const h = routeHarness({ whole });
        await h.post({ excludedQuestionIds: userExcluded, advancedFilters: { sortBy: 'exam' } });
        const call = h.calls[0];
        assert.equal(call.name, whole ? 'question_bank_all' : 'question_bank_candidates');
        assert.equal(modern(call), false);
        assert.deepEqual(plain(call.args), whole
            ? { p_excluded: ['excluded', ...userExcluded] }
            : { p_scope: [{ sources: ['test'] }], p_excluded: userExcluded });
        assert.deepEqual(plain(call.options), { count: 'estimated' });
        assert.deepEqual(plain(steps(call, 'order')), [
            ['order', 'question_number', { ascending: true }], ['order', 'id', { ascending: true }],
        ]);
        assert.deepEqual(steps(call, 'eq').map(s => s[1]), ['is_off_curriculum']);
        await h.post({ page: 2, advancedFilters: { sortBy: 'exam', includeOffCurriculum: true } });
        assert.deepEqual(steps(h.calls[1], 'eq'), []);
        assert.deepEqual(plain(h.calls[1].options), {});
        await h.post({ page: 2, advancedFilters: { includeOffCurriculum: true } });
        assert.equal(h.calls[2].name, 'question_bank_typed');
        assert.deepEqual(steps(h.calls[2], 'eq'), []);
        assert.deepEqual(plain(h.calls[2].options), {});
        assert.equal(steps(call, 'select')[0][1], steps(h.calls[2], 'select')[0][1].replace(', type_sort, type_code', ''));
    }
});

test('Missing typed RPC or fields retry once with all original filters and cache absence for 10 minutes', async () => {
    for (const { error, whole } of [
        { code: 'PGRST202', message: 'Function not found in schema cache' },
        { message: 'Could not find the function public.question_bank_typed' },
        ...['type_sort', 'type_code', 'type_offcur'].map(field => ({ message: `column ${field} does not exist` })),
    ].flatMap(error => [false, true].map(whole => ({ error, whole })))) {
        const h = routeHarness({ whole, search: call => call.name === 'question_bank_typed'
            ? { data: null, error }
            : { data: [{ id: 'q', unit: '함수' }], error: null, count: null } });
        const body = { page: 2, advancedFilters: { units: ['함수'], concepts: ['역함수'], difficulty: ['5'], subjects: ['공통수학2'], keywords: ['조건'] } };
        const result = await h.post(body);
        assert.equal(result.status, 200);
        assert.equal(result.body.success, true);
        assert.equal(result.body.count, null);
        assert.equal(h.calls.length, 2);
        const fallback = h.calls[1];
        assert.equal(h.calls[0].name, 'question_bank_typed');
        assert.equal(fallback.name, whole ? 'question_bank_all' : 'question_bank_candidates');
        assert.deepEqual(plain(fallback.args), whole
            ? { p_excluded: ['excluded'] }
            : { p_scope: [{ sources: ['test'] }], p_excluded: [] });
        assert.deepEqual(plain(fallback.options), {});
        assert.equal(modern(fallback), false);
        assert.equal(steps(fallback, 'select')[0][1], steps(h.calls[0], 'select')[0][1].replace(', type_sort, type_code', ''));
        assert.deepEqual(steps(fallback, 'order').map(s => s[1]), ['question_number', 'id']);
        assert.deepEqual(steps(fallback, 'eq').map(s => s[1]), ['is_off_curriculum']);
        for (const method of ['in', 'overlaps', 'ilike', 'range']) {
            assert.deepEqual(plain(steps(fallback, method)), plain(steps(h.calls[0], method)));
        }
        assert.deepEqual(plain(steps(fallback, 'range')), [['range', 50, 99]]);
        await h.post(body);
        assert.equal(h.calls.length, 3);
        assert.equal(modern(h.calls[2]), false);
        h.advance(10 * 60_000 - 1);
        await h.post(body);
        assert.equal(h.calls.length, 4);
        assert.equal(modern(h.calls[3]), false);
        h.advance(1);
        await h.post(body);
        assert.equal(h.calls.length, 6);
        assert.equal(h.calls[4].name, 'question_bank_typed');
        assert.equal(h.errors.length, 0);
    }
});

test('Unrelated query errors do not trigger a legacy retry', async () => {
    const h = routeHarness({ search: () => ({ error: { message: 'statement timeout' } }) });
    const result = await h.post();
    assert.equal(result.status, 500);
    assert.equal(h.calls.length, 1);
    await h.post();
    assert.equal(h.calls[1].name, 'question_bank_typed');
});

test('First-page fallback preserves count, user exclusions, and inclusion of off-curriculum questions', async () => {
    const userExcluded = ['11111111-1111-1111-1111-111111111111'];
    const h = routeHarness({ whole: true, search: call => call.name === 'question_bank_typed'
        ? { error: { code: 'PGRST202' } }
        : { data: [{ id: 'q', unit: null }], count: 1234 } });
    const result = await h.post({ excludedQuestionIds: userExcluded, advancedFilters: { includeOffCurriculum: true } });
    assert.equal(result.status, 200);
    assert.equal(result.body.count, 1234);
    assert.equal(result.body.countIsEstimate, true);
    assert.deepEqual(plain(result.body.typeDefs), {});
    assert.equal(h.calls[1].name, 'question_bank_all');
    assert.deepEqual(plain(h.calls[1].args), { p_excluded: ['excluded', ...userExcluded] });
    for (const call of h.calls) {
        assert.deepEqual(plain(call.options), { count: 'estimated' });
        assert.deepEqual(steps(call, 'eq'), []);
    }
});

test('Legacy errors return 500 without another retry or disabling the typed RPC', async () => {
    const h = routeHarness({ search: call => call.name === 'question_bank_typed'
        ? { data: [], count: 0 }
        : { error: { code: 'PGRST202' } } });
    const result = await h.post({ advancedFilters: { sortBy: 'exam' } });
    assert.equal(result.status, 500);
    assert.equal(h.calls.length, 1);
    const typedResult = await h.post();
    assert.equal(typedResult.status, 200);
    assert.equal(h.calls[1].name, 'question_bank_typed');

    const fallback = routeHarness({ search: () => ({ error: { code: 'PGRST202' } }) });
    assert.equal((await fallback.post()).status, 500);
    assert.equal(fallback.calls.length, 2);
});

test('Type definitions are cached, scoped to page pairs, and refreshed after 10 minutes', async () => {
    const h = routeHarness({
        search: () => ({ data: [{ unit: '함수', type_code: 'T01' }, { unit: '함수', type_code: 'T01' }, { unit: '방정식', type_code: null }], count: 3 }),
        definitions: [{ unit: '함수', code: 'T01', name: '역함수의 함숫값', ord: 1 }, { unit: '방정식', code: 'T01', name: '근의 조건', ord: 2 }],
    });
    const result = await h.post();
    assert.deepEqual(plain(result.body.typeDefs), { [groups.typeDefinitionKey('함수', 'T01')]: { name: '역함수의 함숫값', ord: 1 } });
    await h.post();
    assert.equal(h.calls.filter(c => c.name === 'question_type_defs').length, 1);
    h.advance(10 * 60_000);
    await h.post();
    assert.equal(h.calls.filter(c => c.name === 'question_type_defs').length, 2);
});

test('Definition lookup failures return an empty object without failing search', async () => {
    const h = routeHarness({ search: () => ({ data: [{ unit: '함수', type_code: 'T01' }] }), definitionsError: { message: 'table missing' } });
    const result = await h.post();
    assert.equal(result.status, 200);
    assert.deepEqual(plain(result.body.typeDefs), {});
    await h.post();
    assert.equal(h.calls.filter(c => c.name === 'question_type_defs').length, 1);
    assert.equal(h.errors.length, 0);
});

test('The definition cache reads beyond the PostgREST row limit', async () => {
    const definitions = Array.from({ length: 1001 }, (_, i) => ({ unit: '함수', code: `T${i}`, name: `유형 ${i}`, ord: i }));
    const h = routeHarness({ search: () => ({ data: [{ unit: '함수', type_code: 'T1000' }] }), definitions });
    const result = await h.post();
    assert.equal(result.body.typeDefs[groups.typeDefinitionKey('함수', 'T1000')].name, '유형 1000');
    assert.equal(h.calls.filter(c => c.name === 'question_type_defs').length, 2);
});

test('Appended pages share one contiguous header and loaded count; unit/code changes split groups', () => {
    const first = Array.from({ length: 50 }, (_, i) => ({ id: `q${i}`, unit: '함수', type_code: 'T01' }));
    const before = groups.indexQuestionTypeGroups(first);
    const after = groups.indexQuestionTypeGroups([...first,
        { id: 'q50', unit: '함수', type_code: 'T01' },
        { id: 'q51', unit: '함수', type_code: 'T02' },
        { id: 'q52', unit: '방정식', type_code: 'T02' },
        { id: 'q53', unit: '방정식', type_code: null },
        { id: 'q54', unit: '방정식' },
        { id: 'q55', unit: '함수', type_code: 'T01' },
    ]);
    assert.equal(before[0].count, 50);
    assert.equal(after[0].count, 51);
    assert.equal(after[0], after[50]);
    assert.equal(after[0].key, before[0].key); // An existing collapsed group stays collapsed.
    assert.deepEqual(after.filter((g, i) => g.start === i).map(g => g.count), [51, 1, 1, 2, 1]);
    assert.notEqual(after[0].key, after[55].key);
    assert.notEqual(groups.typeDefinitionKey('함수', 'T01'), groups.typeDefinitionKey('방정식', 'T01'));
    assert.deepEqual(groups.indexQuestionTypeGroups([]), []);
});
