require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DOMParser, XMLSerializer } = require('xmldom');
const { generateHmlFile } = require('../src/lib/hml-v2/generator.ts');
const { validateHml } = require('../src/lib/hml-v2/validate.ts');

const template = fs.readFileSync(path.join(__dirname, '../수학ETF양식.hml'), 'utf8');
const descendants = (node, tag) => Array.from(node.getElementsByTagName(tag));
const children = node => Array.from(node.childNodes).filter(n => n.nodeType === 1);
const paragraph = text => `<P><TEXT CharShape="0"><CHAR>${text}</CHAR></TEXT></P>`;
const cell = (content, span = 1) => `<CELL ColSpan="${span}"><PARALIST>${content}</PARALIST></CELL>`;
const equation = '<EQUATION><SCRIPT>x^2+1</SCRIPT></EQUATION>';
const picture = '<PICTURE><IMAGE BinItem="1"/></PICTURE>';
const dataTable = `<TABLE RowCount="2" ColCount="2"><ROW>${cell(paragraph('x'))}${cell(paragraph('1'))}</ROW><ROW>${cell(paragraph('y'))}${cell(`<P><TEXT><CHAR>2</CHAR>${equation}${picture}</TEXT></P>`)}</ROW></TABLE>`;
const frame = (role, title, content) => `<TABLE data-hml-style="${role}" RowCount="3" ColCount="3"><ROW>${cell(paragraph(''))}${cell(paragraph(title))}${cell(paragraph(''))}</ROW><ROW>${cell(paragraph(''))}${cell(paragraph(''))}</ROW><ROW>${cell(content, 3)}</ROW></TABLE>`;
const image = { id: 'image', original_bin_id: '1', format: 'png', size_bytes: 68, created_at: '2026-10-19', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvWQAAAAASUVORK5CYII=' };
function generate(content, count = 1, customTemplate = template) {
    const questions = Array.from({ length: count }, (_, i) => ({ id: `q-${i}`, question_number: i + 1, plain_text: '회귀 검사', content_xml: content, layout_lines: 19 }));
    const originalLog = console.log;
    let result;
    try {
        console.log = () => {};
        result = generateHmlFile(customTemplate, questions, new Map(questions.map(q => [q.id, [image]])));
    } finally { console.log = originalLog; }
    validateHml(result.hmlContent);
    return new DOMParser().parseFromString(result.hmlContent, 'text/xml');
}
const bogis = doc => descendants(doc, 'TABLE').filter(table => descendants(table, 'CELL').some(c => c.textContent.replace(/\s/g, '') === '<보기>'));

test('Multi-cell frames use one template bogi, for top-level and nested source tables', () => {
    const content = paragraph('ㄱ. 본문') + `<P><TEXT><CHAR>ㄴ. 수식</CHAR>${equation}</TEXT></P>` + paragraph('ㄷ. 본문');
    for (const nested of [false, true]) {
        const source = frame('BOX_BOGI', '&lt;보 기&gt;', content);
        const doc = generate(paragraph('발문') + (nested ? `<P><TEXT>${source}</TEXT></P>` : source));
        const [bogi] = bogis(doc);
        assert.equal(bogis(doc).length, 1);
        assert.equal(descendants(bogi, 'TABLE').length, 0);
        assert.equal(descendants(bogi, 'SCRIPT')[0].textContent, 'x^2+1');
        assert.equal(descendants(bogi, 'ROW').length, 3, 'Only the template frame remains');
        assert.match(bogi.textContent, /ㄱ\. 본문ㄴ\. 수식x\^2\+1ㄷ\. 본문/);
        assert.ok(descendants(bogi, 'CELL').every(c => c.hasAttribute('BorderFill')));
    }
});

test('Single-cell bogi retains a nested data table, its equations and images once', () => {
    const source = `<TABLE data-hml-style="BOX_BOGI" RowCount="1" ColCount="1"><ROW>${cell(paragraph('&lt;보 기&gt;') + `<P><TEXT>${dataTable}</TEXT></P>`)}</ROW></TABLE>`;
    const doc = generate(paragraph('발문') + source);
    const [bogi] = bogis(doc);
    const [inner] = descendants(bogi, 'TABLE');
    assert.equal(bogis(doc).length, 1);
    assert.equal(descendants(bogi, 'TABLE').length, 1);
    assert.equal(inner.getAttribute('RowCount'), '2');
    assert.equal(descendants(inner, 'CELL').length, 4);
    assert.equal(descendants(bogi, 'SCRIPT').length, 1);
    assert.equal(descendants(bogi, 'IMAGE').length, 1);
    assert.equal(descendants(bogi, 'IMAGE')[0].getAttribute('BinItem'), '1');
});

test('A multi-cell value table with a BOX hint is retained as a table', () => {
    const source = dataTable.replace('<TABLE ', '<TABLE data-hml-style="BOX_BOGI" ');
    const doc = generate(paragraph('발문') + source);
    const [inner] = descendants(bogis(doc)[0], 'TABLE');
    assert.equal(inner.getAttribute('ColCount'), '2');
    assert.equal(descendants(inner, 'CELL').map(c => c.textContent).join('|'), 'x|1|y|2x^2+1');
});

test('Condition and explanation frames discard school title/decorative cells', () => {
    for (const [role, title] of [['BOX_JOKUN', '조건'], ['BOX_MIJU', '해설']]) {
        const doc = generate(paragraph('발문') + frame(role, title, `<P><TEXT><CHAR>조건 내용</CHAR>${equation}${picture}</TEXT></P>`));
        const table = descendants(doc, 'TABLE').find(t => t.textContent.includes('조건 내용'));
        assert.equal(table.getAttribute('ColCount'), '1');
        assert.equal(descendants(table, 'CELL').length, 1);
        assert.equal(table.textContent, '조건 내용x^2+1');
        assert.equal(descendants(table, 'IMAGE').length, 1);
    }
});

test('Role paragraphs retain body text containing 보기 and deduplicate only an exact title', () => {
    const source = `<P data-hml-style="BOX_BOGI"><TEXT><CHAR>&lt; 보 기 &gt;</CHAR></TEXT></P><P data-hml-style="BOX_BOGI"><TEXT><CHAR>보기에서 조건을 확인한다.</CHAR></TEXT></P>`;
    const doc = generate(paragraph('발문') + source);
    assert.equal(bogis(doc).length, 1);
    assert.match(bogis(doc)[0].textContent, /보기에서 조건을 확인한다/);
    assert.equal(descendants(bogis(doc)[0], 'CHAR').filter(c => c.textContent.replace(/\s/g, '') === '<보기>').length, 1);
});

test('Native endnotes and direct BOX_MIJU keep their original numbering and box structure after either final column', () => {
    const shape = '<SHAPEOBJECT InstId="123"><SIZE Width="29852"/><POSITION HorzRelTo="Column" TreatAsChar="false"/></SHAPEOBJECT>';
    const sourceTable = dataTable.replace('<TABLE ', '<TABLE data-hml-style="BOX_JOKUN" ').replace('<ROW>', `${shape}<ROW>`);
    const note = `<ENDNOTE><PARALIST><P><TEXT><AUTONUM Number="21" NumberType="Endnote"><AUTONUMFORMAT SuffixChar=")" Superscript="false" Type="Digit"/></AUTONUM><CHAR> ④</CHAR></TEXT></P><P><TEXT>${sourceTable}</TEXT></P></PARALIST></ENDNOTE>`;
    const source = new DOMParser().parseFromString(note, 'text/xml');
    for (const count of [1, 2, 3, 4, 6]) {
        const doc = generate(`<P><TEXT><CHAR>발문</CHAR>${note}</TEXT></P>` + paragraph('마지막 선지')
            + '<P ColumnBreak="true"><TEXT><CHAR/></TEXT></P>' + paragraph(''), count);
        const section = descendants(doc, 'SECTION')[0];
        const body = children(section);
        const explanation = body.at(-1);
        const boundary = body.at(-2);
        assert.equal(explanation.tagName, 'TABLE', 'BOX_MIJU remains a direct SECTION child');
        assert.equal(boundary.getAttribute('PageBreak'), 'true');
        assert.equal(boundary.getAttribute('ColumnBreak'), 'false');
        assert.equal(boundary.textContent, '');
        assert.equal(body.at(-3).textContent, '마지막 선지', 'No final source/gutter/column-break paragraphs');
        assert.equal(descendants(section, 'P').filter(p => p.getAttribute('PageBreak') === 'true').length, 1);
        assert.equal(descendants(section, 'P').filter(p => p.getAttribute('ColumnBreak') === 'true').length, Math.ceil(count / 2) - 1);
        const notes = descendants(section, 'ENDNOTE');
        assert.equal(notes.length, count);
        for (const en of notes) {
            const num = descendants(en, 'AUTONUM')[0];
            assert.equal(num.getAttribute('NumberType'), 'Endnote');
            assert.equal(num.getAttribute('Number'), '21');
            assert.equal(descendants(num, 'AUTONUMFORMAT')[0].getAttribute('SuffixChar'), ')');
            const [table] = descendants(en, 'TABLE');
            assert.equal(table.getAttribute('ColCount'), '2', 'Native note tables are not replaced with templates');
            assert.equal(descendants(table, 'SHAPEOBJECT')[0].getAttribute('InstId'), '123');
            assert.equal(descendants(table, 'SIZE')[0].getAttribute('Width'), '29852');
            assert.equal(descendants(table, 'POSITION')[0].getAttribute('HorzRelTo'), 'Column');
            assert.equal(descendants(table, 'SCRIPT').length, 1);
            assert.equal(descendants(table, 'IMAGE').length, 1);
        }
        const restoredPs = children(descendants(explanation, 'PARALIST')[0]);
        assert.equal(restoredPs.length, descendants(source, 'P').length * count, 'Original restoration paragraph traversal is preserved');
        assert.equal(descendants(explanation, 'AUTONUM').length, count);
        const numberedTexts = descendants(explanation, 'TEXT').filter(t => t.firstChild?.nodeType === 3);
        assert.deepEqual(numberedTexts.map(t => t.firstChild.nodeValue), Array.from({ length: count }, (_, i) => `${i + 1}. `));
        assert.equal(descendants(explanation, 'CHAR').filter(c => /^\d+\. $/.test(c.textContent)).length, 0, 'No replacement CHAR numbering');
    }
});

test('Missing explanation template retains native notes and raw paragraph restoration after one page break', () => {
    const minimal = '<HWPML><HEAD><MAPPINGTABLE><STYLELIST><STYLE Id="0" Name="Normal" ParaShape="0" CharShape="0"/></STYLELIST></MAPPINGTABLE></HEAD><BODY><SECTION><P><TEXT><CHAR>{{CONTENT_HERE}}</CHAR></TEXT></P></SECTION></BODY></HWPML>';
    const doc = generate(`<P><TEXT><CHAR>발문</CHAR><ENDNOTE><PARALIST>${paragraph('해설')}</PARALIST></ENDNOTE></TEXT></P>`, 1, minimal);
    const body = children(descendants(doc, 'SECTION')[0]);
    const last = body.at(-1);
    assert.equal(body.at(-2).getAttribute('PageBreak'), 'true');
    assert.equal(body.at(-2).getAttribute('ColumnBreak'), 'false');
    assert.equal(descendants(doc, 'ENDNOTE').length, 1);
    assert.equal(last.textContent, '1. 해설');
    assert.equal(descendants(last, 'TEXT')[0].firstChild.nodeType, 3);
});

test('Without explanations, inter-question column breaks remain and no page break is added', () => {
    const doc = generate(paragraph('발문'), 4);
    const body = children(descendants(doc, 'SECTION')[0]);
    assert.equal(body.filter(p => p.getAttribute('ColumnBreak') === 'true').length, 1);
    assert.equal(body.filter(p => p.getAttribute('PageBreak') === 'true').length, 0);
});

function assertTemplateTypography(doc) {
    const styles = new Map(descendants(doc, 'STYLE').map(s => [s.getAttribute('Name'), s]));
    const chars = new Map(descendants(doc, 'CHARSHAPE').map(c => [c.getAttribute('Id'), c]));
    const paras = new Map(descendants(doc, 'PARASHAPE').map(p => [p.getAttribute('Id'), p]));
    const fonts = new Map(descendants(doc, 'FONTFACE').map(face => [face.getAttribute('Lang'),
        new Map(descendants(face, 'FONT').map(font => [font.getAttribute('Id'), font.getAttribute('Name')]))]));
    // Representative HML typography (2026-10-19), including all language faces and both choice styles.
    for (const [name, height, lineSpacing, align, margins, tabPositions] of [
        ['문항_스타일1', '1150', '160', 'Left', ['-2800', '0', '1600', '0', '600'], []],
        ['3선지', '1100', '165', 'Justify', ['800', '2800', '0', '1400', '0'], ['0', '24000', '43000']],
        ['오선지', '1100', '160', 'Justify', ['0', '2800', '0', '1400', '0'], [...Array(36).fill('0'), '14512', '26760', '39008', '51248']],
        ['박스안', '1150', '145', 'Left', ['-2000', '1000', '0', '0', '2000'], ['2400']],
    ]) {
        const style = styles.get(name);
        const shape = chars.get(style.getAttribute('CharShape'));
        const fontIds = descendants(shape, 'FONTID')[0];
        for (const [lang, faces] of fonts) assert.equal(faces.get(fontIds.getAttribute(lang)), '문체부 돋음체', `${name}: ${lang} font`);
        assert.equal(shape.getAttribute('Height'), height);
        assert.equal(shape.getAttribute('TextColor'), '0');
        const para = paras.get(style.getAttribute('ParaShape'));
        const margin = descendants(para, 'PARAMARGIN')[0];
        assert.equal(para.getAttribute('Align'), align);
        assert.equal(margin.getAttribute('LineSpacing'), lineSpacing);
        assert.equal(margin.getAttribute('LineSpacingType'), 'Percent');
        assert.deepEqual(['Indent', 'Left', 'Right', 'Prev', 'Next'].map(attr => margin.getAttribute(attr)), margins);
        const tabs = descendants(doc, 'TABDEF').find(n => n.getAttribute('Id') === para.getAttribute('TabDef'));
        assert.deepEqual(descendants(tabs, 'TABITEM').map(n => n.getAttribute('Pos')), tabPositions, `${name}: tab stops`);
    }
    const checked = { QUESTION: 0, CHOICE: 0, BOX_BOGI: 0, BOX_JOKUN: 0, BOX_MIJU: 0, ENDNOTE: 0 };
    for (const p of descendants(descendants(doc, 'SECTION')[0], 'P')) {
        let role = p.getAttribute('data-hml-style');
        for (let a = p.parentNode; a?.nodeType === 1; a = a.parentNode) {
            if (a.tagName === 'ENDNOTE') { role = 'ENDNOTE'; break; }
            if (a.tagName === 'TABLE' && a.getAttribute('data-hml-style').startsWith('BOX_')) {
                role = a.getAttribute('data-hml-style'); break;
            }
        }
        if (!(role in checked)) continue;
        checked[role]++;
        const label = role.startsWith('BOX_') && p.getAttribute('Style') === styles.get('박스제목').getAttribute('Id');
        const expected = styles.get(label ? '박스제목' : role === 'QUESTION' ? '문항_스타일1' : role === 'CHOICE' ? '3선지' : '박스안');
        assert.equal(p.getAttribute('Style'), expected.getAttribute('Id'), `${role}: paragraph style`);
        if (role === 'QUESTION') {
            const actual = paras.get(p.getAttribute('ParaShape')).cloneNode(true);
            const base = paras.get(expected.getAttribute('ParaShape')).cloneNode(true);
            actual.removeAttribute('Id'); base.removeAttribute('Id');
            actual.removeAttribute('KeepWithNext'); base.removeAttribute('KeepWithNext');
            assert.equal(actual.toString(), base.toString(), 'Question layout only adds glue');
            assert.equal(paras.get(p.getAttribute('ParaShape')).getAttribute('KeepWithNext'), 'true');
        } else {
            assert.equal(p.getAttribute('ParaShape'), expected.getAttribute('ParaShape'), `${role}: paragraph shape`);
        }
        // Only TEXT owned by this P, excluding TEXT in descendant notes/tables.
        for (const text of descendants(p, 'TEXT')) {
            let owner = text.parentNode;
            while (owner && owner.tagName !== 'P') owner = owner.parentNode;
            if (owner !== p) continue;
            const reference = children(text).some(n => n.tagName === 'ENDNOTE');
            assert.equal(text.getAttribute('CharShape'), reference ? '14' : expected.getAttribute('CharShape'), `${role}: text shape`);
            if (reference) {
                assert.equal(chars.get('14').getAttribute('Height'), '100');
                assert.equal(chars.get('14').getAttribute('TextColor'), '16777215');
            }
        }
    }
    for (const [role, count] of Object.entries(checked)) assert.ok(count > 0, `Checked ${role}`);
}

test('Template bogi labels keep their original centered 11pt shapes in top-level and nested boxes', () => {
    const templateDoc = new DOMParser().parseFromString(template, 'text/xml');
    const labelCell = descendants(templateDoc, 'CELL').find(c => c.textContent.replace(/\s/g, '') === '<보기>');
    const original = descendants(labelCell, 'P')[0];
    assert.equal(original.getAttribute('ParaShape'), '13');
    assert.equal(descendants(original, 'TEXT')[0].getAttribute('CharShape'), '15');
    for (const nested of [false, true]) {
        const source = frame('BOX_BOGI', '&lt;보기&gt;', paragraph('보기 본문'));
        const doc = generate(paragraph('발문') + (nested ? `<P><TEXT>${source}</TEXT></P>` : source));
        const title = descendants(bogis(doc)[0], 'CELL').find(c => c.textContent.replace(/\s/g, '') === '<보기>');
        assert.equal(descendants(title, 'P')[0].getAttribute('ParaShape'), '13');
        assert.equal(descendants(title, 'TEXT')[0].getAttribute('CharShape'), '15');
        for (const [tag, id] of [['PARASHAPE', '13'], ['CHARSHAPE', '15']]) {
            assert.equal(descendants(doc, tag).find(n => n.getAttribute('Id') === id).toString(),
                descendants(templateDoc, tag).find(n => n.getAttribute('Id') === id).toString());
        }
        const content = descendants(bogis(doc)[0], 'CELL').find(c => c.textContent === '보기 본문');
        const boxStyle = descendants(doc, 'STYLE').find(s => s.getAttribute('Name') === '박스안');
        assert.equal(descendants(content, 'P')[0].getAttribute('ParaShape'), boxStyle.getAttribute('ParaShape'));
        assert.equal(descendants(content, 'TEXT')[0].getAttribute('CharShape'), boxStyle.getAttribute('CharShape'));
    }
});

test('All role paragraphs and TEXT use template typography, including nested tables and native notes', () => {
    const note = `<ENDNOTE><PARALIST><P Style="4" ParaShape="9"><TEXT CharShape="11"><AUTONUM Number="21" NumberType="Endnote"/><CHAR>해설 본문</CHAR></TEXT></P><P><TEXT>${dataTable}</TEXT></P></PARALIST></ENDNOTE>`;
    const source = `<P data-hml-style="QUESTION" Style="4" ParaShape="9"><TEXT CharShape="11"><CHAR>발문</CHAR>${equation}${picture}</TEXT><TEXT CharShape="11">${note}</TEXT></P>`
        + paragraph('이어지는 발문')
        + frame('BOX_BOGI', '&lt;보기&gt;', paragraph('보기 본문') + `<P data-hml-style="CHOICE" data-hml-orig-style="3선지"><TEXT CharShape="11">${dataTable}</TEXT></P>`)
        + frame('BOX_JOKUN', '조건', paragraph('조건 본문') + `<P><TEXT>${dataTable}</TEXT></P>`)
        + frame('BOX_MIJU', '해설', paragraph('직접 해설 본문'))
        + '<P data-hml-style="CHOICE" data-hml-orig-style="박스"><TEXT CharShape="11"><CHAR>① 선지</CHAR></TEXT></P>';
    const doc = generate(source);
    assertTemplateTypography(doc);
    assert.ok(descendants(doc, 'SCRIPT').every(s => s.textContent === 'x^2+1'));
    assert.ok(descendants(doc, 'IMAGE').length >= 1);
    const serializer = new XMLSerializer();
    for (const eq of descendants(doc, 'EQUATION')) assert.equal(serializer.serializeToString(eq), equation);
});

test('Template style, paragraph and character IDs may change without changing role typography', () => {
    const doc = new DOMParser().parseFromString(template, 'text/xml');
    const remap = (attr, value) => attr === 'CharShape' && value === '14' ? value
        : String(Number(value) + ({ Style: 100, NextStyle: 100, CharShape: 200, ParaShape: 300 }[attr]));
    for (const el of descendants(doc, '*')) {
        for (const attr of ['Style', 'NextStyle', 'CharShape', 'ParaShape']) {
            if (el.hasAttribute(attr)) el.setAttribute(attr, remap(attr, el.getAttribute(attr)));
        }
        const attr = { STYLE: 'Style', CHARSHAPE: 'CharShape', PARASHAPE: 'ParaShape' }[el.tagName];
        if (attr) el.setAttribute('Id', remap(attr, el.getAttribute('Id')));
    }
    const note = `<ENDNOTE><PARALIST>${paragraph('해설')}</PARALIST></ENDNOTE>`;
    const source = `<P><TEXT CharShape="11"><CHAR>발문</CHAR></TEXT><TEXT>${note}</TEXT></P>`
        + frame('BOX_BOGI', '&lt;보기&gt;', paragraph('보기'))
        + frame('BOX_JOKUN', '조건', paragraph('조건'))
        + frame('BOX_MIJU', '해설', paragraph('해설'))
        + '<P data-hml-style="CHOICE"><TEXT CharShape="11"><CHAR>① 선지</CHAR></TEXT></P>';
    assertTemplateTypography(generate(source, 1, new XMLSerializer().serializeToString(doc)));
});
