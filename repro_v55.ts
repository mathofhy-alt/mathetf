
const fs = require('fs');
const { generateHmlFromTemplate: v_gen } = require('./src/lib/hml-v2/generator.ts');

const v_template = fs.readFileSync('./재조립양식.hml', 'utf-8');
const v_mockQ = [
    {
        question: {
            id: 'q1',
            content_xml: `
                <P data-hml-style="QUESTION"><TEXT CharShape="0">Question 1: Solve this.</TEXT></P>
                <TABLE data-hml-style="BOX_BOGI">
                    <ROW>
                        <CELL>
                            <PARALIST>
                                <P><TEXT CharShape="0">보기박스</TEXT></P>
                                <P><TEXT CharShape="0">This should be Ctrl+5 (3선지)</TEXT></P>
                            </PARALIST>
                        </CELL>
                    </ROW>
                </TABLE>
                <P data-hml-style="CHOICE"><TEXT CharShape="0">① Choice A</TEXT></P>
            `,
            question_number: 1
        },
        images: []
    }
];

const v_output = v_gen(v_template, v_mockQ, { title: 'V55 TEST', date: '2026-02-06' });
fs.writeFileSync('test_output_endnote.hml', v_output.hmlContent);
console.log(`Generated test_output_endnote.hml (V55 Fix, Q Count: ${v_output.questionCount})`);
