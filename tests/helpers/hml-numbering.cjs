require('../register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { DOMParser } = require('xmldom');
const { generateHmlFile } = require('../../src/lib/hml-v2/generator.ts');
const { validateHml } = require('../../src/lib/hml-v2/validate.ts');

const template = fs.readFileSync(path.join(__dirname, '../../수학ETF양식.hml'), 'utf8');
const minimal = '<HWPML><HEAD><MAPPINGTABLE><STYLELIST><STYLE Id="0" Name="Normal" ParaShape="0" CharShape="0"/></STYLELIST></MAPPINGTABLE></HEAD><BODY><SECTION><P><TEXT><CHAR>{{CONTENT_HERE}}</CHAR></TEXT></P></SECTION></BODY></HWPML>';
const descendants = (node, tag) => Array.from(node.getElementsByTagName(tag));
function questions(numbers, { namespace = false, caption = false, notesPerQuestion = 1 } = {}) {
    const tag = namespace ? 'hp:' : '';
    return numbers.map((number, i) => {
        const auto = `<${tag}AUTONUM Number="${number}" NumberType="Endnote"><${tag}AUTONUMFORMAT SuffixChar=")" Superscript="false" Type="Digit"/></${tag}AUTONUM>`;
        const text = `<P><TEXT>${auto}<CHAR>해설 Q${i + 1}</CHAR></TEXT></P>`;
        const content = caption ? `<TABLE RowCount="1" ColCount="1"><CAPTION><PARALIST>${text}</PARALIST></CAPTION><ROW><CELL><PARALIST><P><TEXT><CHAR>해설 상자</CHAR></TEXT></P></PARALIST></CELL></ROW></TABLE>` : text;
        const note = number === null ? '' : `<${tag}ENDNOTE><PARALIST>${content}</PARALIST></${tag}ENDNOTE>`;
        return { id: `q-${i}`, question_number: number, plain_text: `문항 Q${i + 1}`, layout_lines: 19,
            content_xml: `<P data-hml-style="QUESTION"><TEXT><CHAR>문항 Q${i + 1}</CHAR>${note.repeat(notesPerQuestion)}</TEXT></P>` };
    });
}
function generate(input, customTemplate = template) {
    const log = console.log;
    try {
        console.log = () => {};
        const result = generateHmlFile(customTemplate, input, new Map());
        validateHml(result.hmlContent);
        return result.hmlContent;
    } finally { console.log = log; }
}
function parse(hml) {
    const doc = new DOMParser().parseFromString(hml, 'text/xml');
    const section = descendants(doc, 'SECTION')[0];
    const body = Array.from(section.childNodes).filter(n => n.nodeType === 1);
    const heading = body.findIndex(n => n.getAttribute('PageBreak') === 'true' && n.textContent === '정답 및 해설');
    const original = body.slice(0, heading < 0 ? undefined : heading);
    const copied = heading < 0 ? [] : body.slice(heading + 1);
    const nums = nodes => nodes.flatMap(n => descendants(n, '*'))
        .filter(n => /^(hp:)?autonum$/i.test(n.tagName) && n.getAttribute('NumberType').toLowerCase() === 'endnote')
        .map(n => Number(n.getAttribute('Number')));
    const labels = copied.flatMap(n => descendants(n, 'TEXT'))
        .filter(n => n.firstChild?.nodeType === 3 && /^\d+\. $/.test(n.firstChild.nodeValue))
        .map(n => Number(n.firstChild.nodeValue.trim().slice(0, -1)));
    return { original: nums(original), copied: nums(copied), labels };
}
module.exports = { questions, generate, parse, template, minimal };
