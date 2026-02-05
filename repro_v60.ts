
const fs = require('fs');
const { generateHmlFromTemplate: v_gen } = require('./src/lib/hml-v2/generator.ts');

const v_template = fs.readFileSync('./재조립양식.hml', 'utf-8');
const v_mockQs = [];

// Create 5 questions of moderate length (~10 lines each + 10 line gutter = 20 lines total per Q)
for (let i = 1; i <= 5; i++) {
    v_mockQs.push({
        question: {
            id: `q${i}`,
            content_xml: `<P data-hml-style="QUESTION"><TEXT CharShape="0">Question ${i}: Solve the following equation.</TEXT></P>`.repeat(5),
            question_number: i
        },
        images: []
    });
}

const v_output = v_gen(v_template, v_mockQs, {
    title: 'V60.3 50-LINE TEST',
    date: '2026-02-06'
});

fs.writeFileSync('test_output_v60.hml', v_output.hmlContent);
console.log(`Generated test_output_v60.hml (V60.3 Fix, Q Count: ${v_output.questionCount})`);

// Audit the output for ColumnBreak
const colBreaks = (v_output.hmlContent.match(/ColumnBreak="true"/g) || []).length;
console.log(`Column Breaks found: ${colBreaks}`);
