require('./register.cjs');
const { test } = require('node:test');
const a = require('node:assert/strict');
const { computeAccess, chooseCharge, planFeature, predictWindows } = require('../src/lib/planAccess.ts');
const { bundleHash, bundleExpired, questionPreview } = require('../src/lib/bundlePolicy.ts');
const DAY = 86400000, epoch = Date.parse('2026-11-01T00:00:00Z');
const at = d => new Date(epoch + d * DAY).toISOString();
const buy = (type, d = 0) => ({ item_type: type, created_at: at(d) });
const use = (feature, d = 0, title = null) => ({ feature, created_at: at(d), title });
const access = (buys = [], uses = [], now = 1, failed = new Set()) => computeAccess(buys, uses, failed, epoch + now * DAY);

test('exam replenishes weekly, print stays lifetime and prediction is independent', () => {
    const p = access([], [use('plan_free_exam'), use('plan_free_bundle'), use('plan_free_bundle')], 100);
    a.equal(p.freeExamLeft, 2); a.equal(p.freeBundleLeft, 0); a.equal(p.freePredictLeft, 1);
    a.equal(chooseCharge(p, 'bundle'), null); a.equal(chooseCharge(p, 'predict'), 'free');
    const q = access([], [use('plan_free_predict', 1)], 1);
    a.equal(q.freeBundleLeft, 2); a.equal(q.freePredictLeft, 0);
});
test('exam pass shares ten credits between exams and print, predictions stay unlimited', () => {
    const uses = [...Array.from({length: 4}, () => use('plan_exam_exam')), ...Array.from({length: 6}, () => use('plan_exam_bundle')), use('plan_exam_predict')];
    const p = access([buy('QB_EXAM')], uses);
    a.equal(p.examLeft, 0); a.equal(p.examGranted, 10);
    a.equal(chooseCharge({...p, freeExamLeft:0}, 'exam'), null);
    a.equal(chooseCharge({...p, freeExamLeft:0, examLeft:1}, 'exam'), 'exam');
    a.equal(chooseCharge({...p, examLeft:0, freePredictLeft:0}, 'predict'), 'exam');
    a.equal(chooseCharge(p, 'predict', true), null); // prediction HWP is instructor-only
    a.equal(p.examUntil, at(14)); a.equal(p.examStart, at(0));
});
test('once never pays for an exam or prediction, even after both other allowances run out', () => {
    const p = { ...access([buy('QB_ONCE')]), freeExamLeft: 0, freeBundleLeft: 0, freePredictLeft: 0 };
    a.equal(chooseCharge(p, 'bundle'), 'once'); a.equal(chooseCharge(p, 'exam'), null); a.equal(chooseCharge(p, 'predict'), null);
    a.equal(access([buy('QB_ONCE')], [use('plan_once_bundle')]).onceLeft, 0);
});
test('download order is free, exam, once; HWP deliberately skips free', () => {
    const p = access([buy('QB_EXAM'), buy('QB_ONCE')]);
    a.equal(chooseCharge(p, 'bundle'), 'free'); a.equal(chooseCharge(p, 'bundle', true), 'exam');
    a.equal(chooseCharge({ ...p, examLeft: 0 }, 'bundle', true), 'once');
    a.equal(chooseCharge(access(), 'bundle', true), null);
});
test('renewal within the period extends days and shared allowance without mutating purchases', () => {
    const buys = [buy('QB_EXAM', 5), buy('QB_EXAM', 0)];
    const p = access(buys, [use('plan_exam_bundle', 2), use('plan_exam_exam', 6), use('plan_exam_predict', 6)], 20);
    a.equal(p.examUntil, at(28)); a.equal(p.examLeft, 18);
    a.equal(buys[0].created_at, at(5));
});
test('renewal after a lapse discards old allowance and old usage, exact expiry is inactive', () => {
    const buys = [buy('QB_EXAM'), buy('QB_EXAM', 15)];
    const p = access(buys, [use('plan_exam_bundle', 2), use('plan_exam_predict', 15)], 16);
    a.equal(p.examStart, at(15)); a.equal(p.examLeft, 10);
    const expired = access([buy('QB_EXAM')], [], 14);
    a.equal(expired.examUntil, null); a.equal(expired.examLeft, 0);
    a.equal(chooseCharge({...expired,freePredictLeft:0},'predict'),null);
});
test('failed PDFs are refunded; an HWP-ready PDF failure must not be put in the failure set', () => {
    const uses = [use('plan_once_bundle', 0, 'bad'), use('plan_free_predict', 0, 'bad2')];
    const p = access([buy('QB_ONCE')], uses, 1, new Set(['bad', 'bad2']));
    a.equal(p.onceLeft, 1); a.equal(p.freePredictLeft, 1);
    a.equal(access([buy('QB_ONCE')], uses).onceLeft, 0);
});
test('overuse clamps every allowance at zero and ignores unrelated historic features', () => {
    const uses = ['plan_free_exam','plan_free_bundle','plan_free_predict','plan_once_bundle','plan_exam_bundle','plan_exam_predict'].flatMap(f => Array.from({length: 30}, () => use(f)));
    const p = access([buy('QB_EXAM'), buy('QB_ONCE')], uses, 0);
    for (const k of ['freeExamLeft','freeBundleLeft','freePredictLeft','onceLeft','examLeft','predictDayLeft','predictWeekLeft']) a.equal(p[k], 0);
    a.equal(access([], [use('predict'), use('print_pdf')]).freePredictLeft, 1);
    a.equal(planFeature('exam', 'predict'), 'plan_exam_predict');
});
test('prediction daily quota resets exactly at Korean midnight, not UTC midnight', () => {
    const uses = [{feature:'plan_free_predict',created_at:'2026-11-03T14:59:59.999Z'}];
    const before = computeAccess([],uses,new Set(),Date.parse('2026-11-03T14:59:59.999Z'));
    a.equal(before.freePredictLeft,0); a.equal(before.predictWeekLeft,2);
    const after = computeAccess([],uses,new Set(),Date.parse('2026-11-03T15:00:00Z'));
    a.equal(after.freePredictLeft,1); a.equal(after.predictWeekLeft,2);
});
test('three distinct days exhaust the week even on an unused day; Monday 00:00 KST resets both', () => {
    const uses = ['2026-11-02','2026-11-03','2026-11-04'].map(d=>({feature:'plan_free_predict',created_at:`${d}T01:00:00Z`}));
    const before=computeAccess([],uses,new Set(),Date.parse('2026-11-08T14:59:59.999Z'));
    a.equal(before.predictDayLeft,1); a.equal(before.predictWeekLeft,0); a.equal(before.freePredictLeft,0);
    const after=computeAccess([],uses,new Set(),Date.parse('2026-11-08T15:00:00Z'));
    a.equal(after.freePredictLeft,1); a.equal(after.predictWeekLeft,3);
    a.equal(new Date(predictWindows(Date.parse('2026-11-08T15:00:00Z')).week).toISOString(),'2026-11-08T15:00:00.000Z');
});
test('daily failure refunds only failed downloads; old lifetime uses and future rows do not consume this week', () => {
    const now=Date.parse('2026-11-05T01:00:00Z');
    const uses=[
        {feature:'plan_free_predict',title:'failed',created_at:'2026-11-05T00:00:00Z'},
        {feature:'plan_free_predict',created_at:'2026-10-01T00:00:00Z'},
        {feature:'plan_free_predict',created_at:'2026-11-06T00:00:00Z'},
    ];
    a.equal(computeAccess([],uses,new Set(),now).freePredictLeft,0);
    const p=computeAccess([],uses,new Set(['failed']),now);
    a.equal(p.freePredictLeft,1); a.equal(p.predictWeekLeft,3);
});
test('30-day expiry boundary and set hashes are format/order independent', () => {
    a.equal(bundleHash(['b','a']), bundleHash(['a','b']));
    a.equal(bundleExpired({ retain_until: at(30) }, epoch + 30 * DAY - 1), false);
    a.equal(bundleExpired({ retain_until: at(30) }, epoch + 30 * DAY), true);
    a.equal(bundleExpired({ retain_until: null }), false);
});
test('server preview strips nested or namespaced solutions and fails closed on unclosed notes', () => {
    const xml = '<P>문제<hp:endNote><P>정답<ENDNOTE>안쪽</ENDNOTE>해설</P></hp:endNote>선지<FOOTNOTE>해설2</FOOTNOTE></P>';
    a.equal(questionPreview(xml), '<P>문제선지</P>');
    a.equal(questionPreview('<P>문제<ENDNOTE/>선지</P>'), '<P>문제선지</P>');
    a.equal(questionPreview('<P>문제<ENDNOTE>비공개'), '<P>문제');
});


test('sheet purchases stack, expire individually at exactly 30 days and consumed purchases never return', () => {
    const buys = [{...buy('QB_SHEET'),id:'old'}, {...buy('QB_SHEET',10),id:'new'}, {...buy('QB_SHEET',40),id:'future'}];
    a.equal(access(buys,[],29).sheetLeft,2);
    a.equal(access(buys,[],29).sheetExpiresAt,at(30));
    a.equal(access(buys,[],30).sheetLeft,1);
    a.equal(access(buys,[],30).sheetExpiresAt,at(40));
    const uses=[{...use('plan_sheet_exam',11),qb_sheet_purchase_id:'new'}];
    a.equal(access(buys,uses,31).sheetLeft,0);
    a.equal(access(buys,uses,31).sheetExpiresAt,null);
    a.equal(access(buys,[],40).sheetLeft,1); // future purchase is now usable
    a.equal(access([{...buy('QB_SHEET'),id:'old'}],[],30-1/86400000).sheetLeft,1);
});
test('exam order is free then shared exam pass then sheet; print and prediction cannot use sheets', () => {
    const p=access([{...buy('QB_SHEET'),id:'sheet'},buy('QB_ONCE'),buy('QB_EXAM')]);
    a.equal(chooseCharge(p,'exam'),'free');
    a.equal(chooseCharge({...p,freeExamLeft:0},'exam'),'exam');
    a.equal(chooseCharge({...p,freeExamLeft:0,examLeft:0},'exam'),'sheet');
    a.equal(chooseCharge({...p,freeExamLeft:0,examLeft:0,sheetLeft:0},'exam'),null);
    const sheets={...p,freeExamLeft:0,freeBundleLeft:0,freePredictLeft:0,onceLeft:0,examLeft:0,examUntil:null};
    a.equal(chooseCharge(sheets,'bundle'),null); a.equal(chooseCharge(sheets,'predict'),null);
});
test('free exam quota resets at Monday KST 00:00 and ignores earlier weeks', () => {
    const uses=[{feature:'plan_free_exam',created_at:'2026-11-02T00:00:00Z'}, {feature:'plan_free_exam',created_at:'2026-11-08T14:00:00Z'}];
    a.equal(computeAccess([],uses,new Set(),Date.parse('2026-11-08T14:59:59.999Z')).freeExamLeft,0);
    a.equal(computeAccess([],uses,new Set(),Date.parse('2026-11-08T15:00:00Z')).freeExamLeft,2);
});
