
const fs = require('fs');
const { generateHmlFromTemplate: v_gen } = require('./src/lib/hml-v2/generator.ts');

const v_template = fs.readFileSync('./재조립양식.hml', 'utf-8');
const v_mockQ = [
    {
        question: {
            id: 'q1',
            content_xml: '<P data-hml-style="QUESTION"><TEXT CharShape="0">Question 1 Content</TEXT></P>',
            question_number: 1
        },
        images: []
    }
];

const v_output = v_gen(v_template, v_mockQ, { title: 'V53 TEST', date: '2026-02-06' });
fs.writeFileSync('test_output_endnote.hml', v_output.hmlContent);
console.log(`Generated test_output_endnote.hml (V53 Fix, Q Count: ${v_output.questionCount})`);
