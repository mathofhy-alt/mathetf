require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const cp = require('../src/lib/questions/chatPlan.ts');
const ct = require('../src/lib/questions/chatTypes.ts');

const concepts = { '공통수학2|합성함수와역함수': { '#역함수': 20 }, '수학(하)|합성함수와역함수': {}, '공통수학2|원의방정식': {} };
const defs = {
    합성함수와역함수: [{ unit: '합성함수와역함수', code: 'T08', name: '역함수의 함숫값', what: '역함수의 정의로 함수의 값을 구한다', count: 20, ord: 8, offcur: false }],
    원의방정식: [{ unit: '원의방정식', code: 'T15', name: '두 원의 공통현과 지나는 원', what: '공통현을 지나는 원의 방정식', count: 5, ord: 15, offcur: false }],
};
function plan(overrides = {}) {
    return { action: 'build', reply: '', targets: ['공통수학2|합성함수와역함수'], concepts: [], types: [], keywords: [], topic: '', topicLabel: '', count: 10,
        minDifficulty: 1, maxDifficulty: 10, order: 'easy_to_hard', fillRest: false,
        filters: { years: [], kinds: [], qtype: '', grades: [], semesters: [], schools: [], points: [] }, unsupported: '', ...overrides };
}
const candidate = (id, difficulty = 5, unit = '합성함수와역함수') => ({ id, difficulty, unit, similarity: null, tag_hit: false, kw_hit: false });
const assignment = (code = 'T08', unit = '합성함수와역함수', sort_key = 108) => ({ unit, code, sort_key, ord: Number(code.slice(1)) });
const plain = x => JSON.parse(JSON.stringify(x));

function loadTs(relative, imports, globals = {}) {
    const file = path.join(__dirname, '..', relative);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, process: { env: {} }, console, ...globals, require: name => {
        if (!(name in imports)) throw new Error(`Unexpected import: ${name}`);
        return imports[name];
    } }, { filename: file });
    return module.exports;
}
function builder(p) {
    return loadTs('src/lib/questions/chatBuild.ts', {
        './chatPlan': { ...cp, planFromChat: async (_, catalog, maxCount, __, types) => cp.sanitizePlan(p, catalog, maxCount, types) },
        './chatTypes': ct,
    }, { fetch: () => { throw new Error('No live AI calls in tests'); } }).buildFromChat;
}

test('Plans retain only catalog unit/code pairs, deduplicate, support older plans, and select the correct unit', () => {
    const p = cp.sanitizePlan(plan({ targets: [], types: [null, { unit: '합성함수와역함수', code: 'T08' }, { unit: '원의방정식', code: 'T08' }, { unit: '합성함수와역함수', code: 'T08' }] }), concepts, 50, defs);
    assert.deepEqual(p.types, [{ unit: '합성함수와역함수', code: 'T08' }]);
    assert.deepEqual(p.targets, ['공통수학2|합성함수와역함수', '수학(하)|합성함수와역함수']);
    assert.deepEqual(cp.sanitizePlan(plan({ types: undefined }), concepts, 50, defs).types, []);
    assert.deepEqual(cp.sanitizePlan(plan({ types: p.types }), concepts, 50).types, []);
});

test('AI receives type name, one-line description, counts and the strict unit/code schema; follow-ups receive prior types', async () => {
    let request;
    const modelPlan = plan({ types: [{ unit: '합성함수와역함수', code: 'T08' }] });
    const module = loadTs('src/lib/questions/chatPlan.ts', {}, {
        process: { env: { OPENAI_API_KEY: 'test-only' } }, AbortSignal,
        fetch: async (_, options) => {
            request = JSON.parse(options.body);
            return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(modelPlan) } }] }) };
        },
    });
    const result = await module.planFromChat([{ role: 'user', content: '10개만' }], concepts, 50, modelPlan, defs);
    assert.deepEqual(plain(result.types), modelPlan.types);
    const system = request.messages[0].content;
    for (const text of ['역함수의 함숫값', '역함수의 정의로 함수의 값을 구한다', '20문항', '공통현', '"code":"T08"']) assert.ok(system.includes(text), text);
    const schema = request.response_format.json_schema.schema;
    assert.ok(schema.required.includes('types'));
    assert.deepEqual(schema.properties.types.items.required, ['unit', 'code']);
});

test('Explicit type selection ignores tag/keyword guesses, forbids fillRest, and distinguishes identical codes in other units', async () => {
    const p = plan({ types: [{ unit: '없는단원', code: 'T08' }, { unit: '합성함수와역함수', code: 'T08' }], keywords: ['공통현'], concepts: ['#역함수'], topic: 'AI guess', fillRest: true });
    const candidates = [candidate('correct'), candidate('wrong-code'), candidate('wrong-unit'), candidate('untyped')];
    const build = builder(p);
    const out = await build([{ role: 'user', content: '역함수의 함숫값 유형으로 10문제' }], concepts, 50, null, async (p, targets, query) => {
        assert.deepEqual(plain(p.concepts), []);
        assert.deepEqual(plain(p.keywords), []);
        assert.equal(query, null);
        assert.ok(targets.every(t => t.endsWith('|합성함수와역함수')));
        return candidates;
    }, undefined, undefined, { catalog: defs, typesOf: async () => new Map([
        ['correct', assignment()], ['wrong-code', assignment('T01')], ['wrong-unit', assignment('T08', '원의방정식')],
    ]) });
    assert.deepEqual(plain(out.chosen.map(c => c.id)), ['correct']);
    assert.equal(out.by, 'type');
    assert.equal(out.plan.fillRest, false);
    assert.match(out.reply, /9개 부족/);
    assert.match(out.reply, /다른 유형은 보태지/);
});

test('Rare types beyond the first 600 candidates are fetched with accumulated exclusions and no duplicates', async () => {
    const p = plan({ types: [{ unit: '원의방정식', code: 'T15' }], count: 2 });
    let calls = 0;
    const out = await builder(p)([{ role: 'user', content: '공통현 문제만' }], concepts, 50, null, async (_, targets, query, skipped) => {
        calls++;
        assert.equal(query, null);
        assert.deepEqual(plain(targets), ['공통수학2|원의방정식']);
        if (calls === 1) return Array.from({ length: 600 }, (_, i) => candidate(`other-${i}`, 5, '원의방정식'));
        assert.equal(skipped.length, 600);
        return [candidate('found', 7, '원의방정식')];
    }, undefined, undefined, { catalog: defs, typesOf: async ids => new Map(ids.filter(id => id === 'found').map(id => [id, assignment('T15', '원의방정식', 215)])) });
    assert.equal(calls, 2);
    assert.deepEqual(plain(out.chosen.map(c => c.id)), ['found']);
});

test('Broad requests round-robin across types including unclassified questions, retaining difficulty spread within each type', async () => {
    const candidates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => candidate(`a${n}`, n));
    candidates.push(...[1, 4, 7, 10].map(n => candidate(`b${n}`, n)), candidate('untyped', 3));
    const support = { catalog: defs, typesOf: async ids => new Map(ids.filter(id => id !== 'untyped').map(id => [id, assignment(id.startsWith('a') ? 'T01' : 'T08')])) };
    const out = await builder(plan({ count: 7 }))([{ role: 'user', content: '합성함수 7문제' }], concepts, 50, null, async () => candidates, undefined, undefined, support);
    assert.equal(out.chosen.length, 7);
    assert.equal(out.chosen.filter(c => c.type?.code === 'T01').length, 3);
    assert.equal(out.chosen.filter(c => c.type?.code === 'T08').length, 3);
    assert.equal(out.chosen.filter(c => !c.type).length, 1);
    assert.deepEqual(plain(out.chosen.filter(c => c.type?.code === 'T01').map(c => c.difficulty)), [1, 2, 3]);
    assert.match(out.reply, /단원·유형·난이도 순/);
});

test('Typed output always follows unit, type ord, difficulty; missing assignments remain usable', () => {
    const rows = [
        { ...candidate('later-unit', 1, '원의방정식'), type: assignment('T01', '원의방정식', 201) },
        { ...candidate('hard', 9), type: assignment('T08') },
        { ...candidate('easy', 1), type: assignment('T08') },
        { ...candidate('early-type', 8), type: assignment('T01', '합성함수와역함수', 101) },
        candidate('untyped'),
    ];
    for (const order of ['easy_to_hard', 'hard_to_easy', 'mixed']) {
        assert.deepEqual(cp.pickSpread(rows, 5, order).map(c => c.id), ['early-type', 'easy', 'hard', 'later-unit', 'untyped']);
    }
    assert.equal(cp.pickSpread(rows, 0, 'mixed').length, 0);
});

test('Picking one question per type still covers multiple difficulty levels', () => {
    const rows = Array.from({ length: 10 }, (_, t) => Array.from({ length: 10 }, (_, d) => ({
        ...candidate(`${t}-${d}`, d + 1), type: assignment(`T${String(t + 1).padStart(2, '0')}`),
    }))).flat();
    const chosen = cp.pickSpread(rows, 10, 'easy_to_hard');
    assert.equal(new Set(chosen.map(c => c.type.code)).size, 10);
    assert.equal(new Set(chosen.map(c => c.difficulty)).size, 10);
});

test('Missing type tables and failed candidate lookups both use the existing selection path', async () => {
    const rows = [candidate('easy', 2), candidate('hard', 9)];
    const p = plan({ types: [{ unit: '합성함수와역함수', code: 'T08' }], count: 2 });
    for (const support of [undefined, { catalog: defs, typesOf: async () => { throw new Error('offline'); } }]) {
        const out = await builder(p)([{ role: 'user', content: '역함수의 함숫값 2문제' }], concepts, 50, null, async () => rows, undefined, undefined, support);
        assert.deepEqual(plain(out.chosen.map(c => c.id)), ['easy', 'hard']);
        assert.deepEqual(plain(out.plan.types), []);
        assert.equal(out.by, 'unit');
    }
});

test('Whole-exam requests retain original question number order even with type support', async () => {
    const p = plan({ filters: { ...plan().filters, years: ['2026'], schools: ['중동'], semesters: ['1학기중간'] } });
    const out = await builder(p)([{ role: 'user', content: '2026년 중동고 1학기중간 전부' }], concepts, 50, null,
        async () => [candidate('second'), candidate('first')], undefined, async () => new Map([['second', 2], ['first', 1]]),
        { catalog: defs, typesOf: async () => { throw new Error('whole exam should not read types'); } });
    assert.equal(out.by, 'whole_exam');
    assert.deepEqual(plain(out.chosen.map(c => c.id)), ['first', 'second']);
});

test('Type catalog pages definitions, reads aggregate counts once, shares inflight work, and expires at one hour', async () => {
    let now = 1000;
    const calls = [];
    const tables = {
        question_type_defs: [...Object.values(defs).flat(), ...Array.from({ length: 1000 }, (_, i) => ({ unit: '다항식', code: `T${i}`, name: '유형', what: null, ord: i, offcur: i === 0 }))],

    };
    const cached = ct.createTypeCatalogCache(async (table, from, to, count) => {
        calls.push({ table, from, to, count });
        return { data: tables[table].slice(from, to + 1), error: null, count: count ? tables[table].length : null };
    }, async () => {
        calls.push({ rpc: 'question_type_counts' });
        return { data: [
            { unit: Object.keys(defs)[0], code: 'T08', n: 2000 },
            { unit: Object.keys(defs)[1], code: 'T15', n: 1 },
        ], error: null };
    }, () => now);
    const [a, b] = await Promise.all([cached(), cached()]);
    assert.equal(a, b);
    assert.equal(a.합성함수와역함수[0].count, 2000);
    assert.equal(a.원의방정식[0].count, 1);
    assert.equal(a.다항식.length, 1000);
    assert.equal(a.다항식[0].what, '');
    assert.equal(a.다항식[0].offcur, true);
    assert.equal(calls.length, 3);
    now += 3_600_000 - 1;
    await cached();
    assert.equal(calls.length, 3);
    now++;
    await cached();
    assert.equal(calls.length, 6);
    assert.equal(calls.filter(c => c.rpc === 'question_type_counts').length, 2);
    assert.ok(calls.filter(c => c.table).every(c => c.table === 'question_type_defs'));
});

test('Failed catalog definitions, RPC errors, missing counts and rejected reads return null and retry', async () => {
    for (const failure of ['definitions', 'rpc', 'missing', 'rejected']) {
        let failed = true;
        const cached = ct.createTypeCatalogCache(async () => ({
            data: Object.values(defs).flat(), count: 2,
            error: failed && failure === 'definitions' ? { message: 'offline' } : null,
        }), async () => {
            if (failed && failure === 'rejected') throw new Error('offline');
            return {
                data: failed && failure === 'missing' ? null : [],
                error: failed && failure === 'rpc' ? { message: 'offline' } : null,
            };
        });
        assert.equal(await cached(), null, failure);
        failed = false;
        const catalog = await cached();
        assert.equal(catalog[Object.keys(defs)[0]][0].count, 0);
    }
});

function routeHarness({ includeOff = false, definitionError = false, countsError = false } = {}) {
    const calls = [];
    const rows = Array.from({ length: 401 }, (_, i) => candidate(`q${i}`, i % 10 + 1));
    const assignments = rows.map(r => ({ question_id: r.id, ...assignment() }));
    const typeDefs = [{ ...defs.합성함수와역함수[0], offcur: includeOff }];
    const sb = {
        rpc(name, args) {
            calls.push({ name, args });
            if (name === 'question_type_counts') return Promise.resolve({ data: [{ unit: typeDefs[0].unit, code: typeDefs[0].code, n: assignments.length }], error: countsError ? { message: 'RPC unavailable' } : null });
            if (name === 'question_bank_concept_counts') return Promise.resolve({ data: concepts, error: null });
            if (name === 'question_bank_topic') return Promise.resolve({ data: rows, error: null });
            throw new Error(`Unexpected RPC: ${name}`);
        },
        from(table) {
            const call = { table, steps: [] };
            calls.push(call);
            const q = {};
            for (const method of ['select', 'order', 'range', 'in', 'insert']) q[method] = (...args) => { call.steps.push([method, ...args]); return q; };
            q.then = (resolve, reject) => Promise.resolve().then(() => {
                if (table === 'qb_chat_logs') return { error: null };
                let data = table === 'question_type_defs' ? typeDefs : table === 'question_types' ? assignments : [];
                const ids = call.steps.find(s => s[0] === 'in');
                if (ids) data = data.filter(r => ids[2].includes(r[ids[1]]));
                const count = data.length;
                const range = call.steps.find(s => s[0] === 'range');
                if (range) data = data.slice(range[1], range[2] + 1);
                return { data, count, error: definitionError && table === 'question_type_defs' ? { message: 'table missing' } : null };
            }).then(resolve, reject);
            return q;
        },
    };
    const p = plan({ count: 3, types: [{ unit: '합성함수와역함수', code: 'T08' }],
        filters: { ...plan().filters, years: ['2025'], qtype: 'multiple_choice' } });
    const route = loadTs('src/app/api/pro/chat-generate/route.ts', {
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
        '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'tester' } } }) } }) },
        '@/utils/supabase/server-admin': { createAdminClient: () => sb },
        '@/lib/questions/fastScope': {
            cachedFacets: async () => Object.keys(concepts).map(t => { const [subject, unit] = t.split('|'); return { subject, unit }; }),
            resolveRequestScope: async () => ({ scope: [{ sources: ['test-source'] }], catalog: [{ id: 'test' }] }),
            isWholeCatalog: () => true, wholeCatalogIneligible: async () => ['ineligible'],
        },
        '@/lib/questions/chatPlan': cp,
        '@/lib/questions/chatBuild': { buildFromChat: builder(p) },
        '@/lib/questions/chatTypes': ct,
        '@/lib/payments/order': { uuidPattern: /^[0-9a-f-]{36}$/ },
    });
    return { calls, route, post: (body = {}) => route.POST({ json: async () => ({
        messages: [{ role: 'user', content: '역함수의 함숫값 유형으로 3문제' }], selectedDbs: ['test'],
        excludedQuestionIds: ['11111111-1111-1111-1111-111111111111'], ...body,
    }) }) };
}

test('Route warms the hourly catalog once, preserves scope/exclusions/filters, and reads candidate assignments in 200-ID batches', async () => {
    const h = routeHarness();
    await h.route.GET();
    const response = await h.post();
    assert.equal(response.status, 200);
    assert.equal(response.body.by, 'type');
    assert.equal(response.body.questions.length, 3);
    const topic = h.calls.find(c => c.name === 'question_bank_topic').args;
    assert.deepEqual(plain(topic.p_scope), [{ sources: ['test-source'] }]);
    assert.deepEqual(plain(topic.p_excluded), ['11111111-1111-1111-1111-111111111111', 'ineligible']);
    assert.equal(topic.p_include_off, false);
    assert.equal(topic.p_filter.qtype, 'multiple_choice');
    assert.deepEqual(plain(topic.p_filter.years), ['2025']);
    const lookups = h.calls.filter(c => c.table === 'question_types' && c.steps.some(s => s[0] === 'in'));
    assert.deepEqual(lookups.map(c => c.steps.find(s => s[0] === 'in')[2].length), [200, 200, 1]);
    await h.post();
    assert.equal(h.calls.filter(c => c.table === 'question_type_defs').length, 1);
    assert.equal(h.calls.filter(c => c.table === 'question_types' && !c.steps.some(s => s[0] === 'in')).length, 0);
    assert.equal(h.calls.filter(c => c.name === 'question_type_counts').length, 1);
});

test('Route excludes off-curriculum type definitions by default, allows opt-in, and survives missing tables', async () => {
    const h = routeHarness({ includeOff: true });
    assert.deepEqual(plain((await h.post()).body.plan.types), []);
    const allowed = await h.post({ includeOffCurriculum: true });
    assert.equal(allowed.body.by, 'type');
    assert.equal(h.calls.filter(c => c.name === 'question_bank_topic').at(-1).args.p_include_off, true);
    for (const failure of [{ definitionError: true }, { countsError: true }]) {
        const unavailable = await routeHarness(failure).post();
        assert.equal(unavailable.status, 200);
        assert.equal(unavailable.body.by, 'unit');
        assert.deepEqual(plain(unavailable.body.plan.types), []);
    }
});
