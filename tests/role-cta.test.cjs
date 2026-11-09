require('./register.cjs');
const { test } = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const cta = require('../src/lib/role-cta.ts');
const { FREE_TRIAL } = require('../src/lib/qbPassConfig.ts');
const { safeAttribution } = require('../src/lib/analytics/campaigns.ts');
const src = '오금고등학교_2025_1학기중간_공통수학1';
const createHref = `/question-bank?src=${encodeURIComponent(src)}&origin=exam`;
const pass = { unlimited: false, passUntil: null, freeExamLeft: FREE_TRIAL.exam, freeLeft: FREE_TRIAL.exam, examUntil: null, examLeft: 0, sheetLeft: 0 };
const root = path.join(__dirname, '../src');
function load(file, deps = {}, globals = {}) {
    const mod = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, { module: mod, exports: mod.exports, console, URLSearchParams, setTimeout, clearTimeout,
        require: name => name in deps ? deps[name] : require(name.startsWith('.') ? path.resolve(root, path.dirname(file), name) : name), ...globals });
    return mod.exports;
}
function promo(role, options = {}) {
    const calls = [];
    const Component = load('components/ExamPromoModal.tsx', {
        'next/link': { default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children), __esModule: true },
        '@/lib/role-cta': { ...cta, ROLE_CTA_V2: options.enabled ?? true },
        '@/lib/useProfilePersona': { useProfilePersona: () => ({ persona: role, ready: true }) },
        '@/lib/usePassInfo': { usePassInfo: () => ({ info: options.info ?? pass }) },
        '@/components/RoleOnboardingModal': { getStoredRole: () => { calls.push('storedRole'); return 'student'; } },
    }).default;
    const html = renderToStaticMarkup(React.createElement(Component, {
        src, onClose() {}, allowHideToday: false,
        ...(options.context === false ? {} : { freePdfDetail: { createHref, ...(options.paid === false ? {} : { paidHref: '#paid-materials' }) } }),
    }));
    return { html, calls };
}

test('학생·학부모는 구매를 강조하고 무료 정답 제작과 유사문제를 작은 링크로 제공한다', () => {
    for (const role of ['student', 'parent']) {
        const { html, calls } = promo(role);
        a.match(html, /href="#paid-materials"[^>]*rd-btn-primary/);
        a.match(html, /이 시험 문제\+해설 받기 \(구매\)/);
        a.match(html, /origin=free-pdf&amp;intent=answer/);
        a.match(html, /rd-text-btn[^>]*>무료로 정답·해설 PDF 만들기/);
        a.match(html, /variant=similar1/);
        a.doesNotMatch(html, /이 회차로 시험지 만들기/);
        a.deepEqual(calls, []);
    }
});
test('판매 해설이 없으면 구매 버튼을 숨기고 역할 모름은 강사 링크도 제공한다', () => {
    for (const role of ['student', 'parent', 'unknown']) {
        a.doesNotMatch(promo(role, { paid: false }).html, /이 시험 문제\+해설 받기|#paid-materials/);
    }
    const { html } = promo('unknown');
    a.match(html, /이 회차로 시험지 만들기/);
    a.match(html, /intent=answer/);
    a.match(html, /이 시험 문제\+해설 받기/);
});
test('강사는 기존 createHref와 origin=exam을 큰 제작 버튼으로 사용한다', () => {
    const { html } = promo('teacher');
    a.match(html, /origin=exam" class="rd-btn rd-btn-primary rd-btn-block"/);
    a.match(html, /이 회차로 시험지 만들기/);
    a.doesNotMatch(html, /intent=answer|#paid-materials/);
    const actions = cta.rolePromoActions('teacher', src, '/question-bank?material=verified&origin=exam');
    a.equal(actions.create, '/question-bank?material=verified&origin=exam');
});
test('끄기 상수와 상세 무료 PDF 문맥 경계는 기존 팝업을 복원한다', () => {
    a.equal(cta.ROLE_CTA_V2, true);
    for (const options of [{ enabled: false }, { context: false }]) {
        const { html, calls } = promo('teacher', options);
        a.match(html, /정답·해설 받기/);
        a.doesNotMatch(html, /intent=answer|#paid-materials/);
        a.equal(calls.length, 1);
    }
    a.equal(cta.isAnswerEntry(new URLSearchParams({ src, intent: 'answer' }), false), false);
});
test('주 무료와 이용권 문구는 실제 잔여량과 기존 차감 순서를 따른다', () => {
    a.match(cta.answerLinkLabel(pass), new RegExp(`무료로 .*주 ${FREE_TRIAL.exam}회`));
    a.match(cta.answerUsage({ ...pass, freeExamLeft: 1, examUntil: 'future', examLeft: 7 }).notice, /무료 1회 남음/);
    const teacher = { ...pass, unlimited: true, passUntil: 'future' };
    a.match(cta.answerLinkLabel(teacher), /강사 이용권 사용/);
    a.doesNotMatch(cta.answerLinkLabel(teacher), /무료로|주 .*회/);
    a.match(cta.answerUsage(teacher).notice, /무료 횟수는 사용하지 않습니다/);
    a.match(cta.answerUsage({ ...pass, freeExamLeft: 0, examUntil: 'future', examLeft: 7, sheetLeft: 3 }).notice, /시험대비권 7건/);
    a.match(cta.answerUsage({ ...pass, freeExamLeft: 0, sheetLeft: 3 }).notice, /1장권 3장/);
    a.match(cta.answerUsage({ ...pass, freeExamLeft: 0 }).notice, /이용권이 필요/);
    a.doesNotMatch(cta.answerLinkLabel(null), /무료로|주 .*회/);
});
test('intent=answer 진입에만 안내를 켜고 회차의 학년·학기·제목을 미리 채운다', () => {
    const params = new URLSearchParams({ src, intent: 'answer' });
    a.equal(cta.isAnswerEntry(params), true);
    for (const p of [{ src }, { intent: 'answer' }, { src, intent: 'answer', variant: 'similar1' }]) a.equal(cta.isAnswerEntry(new URLSearchParams(p)), false);
    a.equal(cta.answerExamTitle(src, { school: '오금고등학교', year: 2025, grade: 1, semester: '1학기중간', subject: '공통수학1' }), '오금고등학교 2025 1학년-1학기 중간 공통수학1 정답·해설');
    a.equal(cta.answerExamTitle('용화여고_2026_2학기중간_3학년_기하'), '용화여고 2026 3학년-2학기 중간 기하 정답·해설');
    a.ok(cta.answerExamTitle('긴학교'.repeat(60)).length <= 100);
    const Banner = load('components/question-bank/AnswerPdfBanner.tsx', { '@/lib/role-cta': cta }).default;
    const html = renderToStaticMarkup(React.createElement(Banner, { info: { ...pass, freeExamLeft: 1 }, disabled: false, onGenerate() {} }));
    a.match(html, /이대로 정답·해설 PDF 받기/);
    a.match(html, /무료 1회 남음 중 저장 시 1회/);
    a.match(html, /원본에 포함된 정답·해설만 제공/);
});
test('본인 persona 조회만 사용하고 비로그인·누락·조회 실패는 unknown으로 처리한다', async () => {
    for (const scenario of ['teacher', 'student', 'parent', 'missing', 'anonymous', 'authError', 'profileError', 'throw']) {
        let state, effect, selected, eq;
        const hook = load('lib/useProfilePersona.ts', {
            react: { useState: initial => [initial, value => { state = value; }], useEffect: fn => { effect = fn; } },
            '@/lib/role-cta': cta,
            '@/utils/supabase/client': { createClient: () => ({
                auth: { getUser: async () => {
                    if (scenario === 'throw') throw Error('offline');
                    return { data: { user: scenario === 'anonymous' ? null : { id: 'self' } }, error: scenario === 'authError' ? {} : null };
                }, onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
                from: table => { a.equal(table, 'profiles'); return {
                    select(column) { selected = column; return this; }, eq(k, v) { eq = [k, v]; return this; },
                    maybeSingle: async () => ({ data: { persona: scenario === 'missing' ? null : scenario, role: 'teacher' }, error: scenario === 'profileError' ? {} : null }),
                }; },
            }) },
        });
        hook.useProfilePersona(true);
        const cleanup = effect();
        await new Promise(resolve => setImmediate(resolve));
        a.equal(state.persona, ['teacher', 'student', 'parent'].includes(scenario) ? scenario : 'unknown');
        a.equal(state.ready, true);
        if (selected) { a.equal(selected, 'persona'); a.deepEqual(Array.from(eq), ['id', 'self']); }
        cleanup();
    }
});
test('생성 클릭 feature 이벤트는 허용되어 저장되며 free-pdf origin을 보존한다', async () => {
    const rows = [];
    const route = load('app/api/log/feature/route.ts', {
        'next/server': { NextResponse: { json: body => ({ body }) } },
        '@/utils/supabase/server': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'self' } } }) } }) },
        '@/utils/supabase/server-admin': { createAdminClient: () => ({ from: table => ({ insert: async row => { a.equal(table, 'feature_usage'); rows.push(row); return { error: null }; } }) }) },
    });
    await route.POST({ json: async () => ({ feature: 'qb_generate_click', title: 'v2|answer|free-pdf|24' }) });
    a.equal(rows[0].feature, 'qb_generate_click');
    a.equal(rows[0].title, 'v2|answer|free-pdf|24');
    a.equal(safeAttribution({ origin: 'free-pdf' }).origin, 'free-pdf');
    a.equal(cta.promoV2Title(src, 'unknown', 'purchase').split('|').slice(0, 3).join('|'), 'v2|unknown|purchase');
});
test('안내는 상단에 있고 기존 설정·저장·PDF 처리와 비로그인 차단·정적 캐시를 유지한다', () => {
    const page = fs.readFileSync(path.join(root, 'app/question-bank/page.tsx'), 'utf8');
    a.ok(page.indexOf('<AnswerPdfBanner') < page.indexOf('<div className="workbench-title"'));
    a.match(page, /onGenerate=\{openFinalConfig\}/);
    a.match(page, /onClick=\{openFinalConfig\}/);
    a.match(page, /initialTitle=\{examTitle\}/);
    a.match(page, /authChecked && !user/);
    a.match(page, /downloadExamPdf\(savedExam.id, setExamPdfStatus\)/);
    a.match(page, /onConfirm=\{handleConfigConfirm\}/);
    a.match(fs.readFileSync(path.join(root, 'app/exam/[id]/page.tsx'), 'utf8'), /export const revalidate = 3600/);
    const byIds = fs.readFileSync(path.join(root, 'app/api/questions/by-ids/route.ts'), 'utf8');
    a.match(byIds, /await memberOnly\(\)/);
    a.doesNotMatch(byIds.match(/const SELECT_COLS = (.*);/)[1], /content_xml|fragment_xml|plain_text/);
});

test('실제 생성기는 원본 미주의 정답·해설을 포함하며 미주가 없으면 만들어 내지 않는다', () => {
    const { generateHmlFile } = require('../src/lib/hml-v2/generator.ts');
    const template = fs.readFileSync(path.join(__dirname, '../수학ETF양식.hml'), 'utf8');
    const note = '<ENDNOTE><PARALIST><P><TEXT><AUTONUM Number="1" NumberType="Endnote"/><CHAR>역할CTA정답④</CHAR></TEXT></P><P><TEXT><CHAR>역할CTA풀이</CHAR></TEXT></P></PARALIST></ENDNOTE>';
    const generate = suffix => {
        const log = console.log;
        try {
            console.log = () => {};
            return generateHmlFile(template, [{ id: 'q1', question_number: 1, content_xml: `<P><TEXT><CHAR>역할CTA문제</CHAR>${suffix}</TEXT></P>`, layout_lines: 5 }], new Map()).hmlContent;
        } finally { console.log = log; }
    };
    const withNote = generate(note);
    a.match(withNote, /역할CTA정답④/);
    a.match(withNote, /역할CTA풀이/);
    a.doesNotMatch(generate(''), /역할CTA정답④|역할CTA풀이/);
});
