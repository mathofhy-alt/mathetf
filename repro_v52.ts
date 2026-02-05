
var v_fs = require('fs');
var v_path = require('path');
var { DOMParser: v_DP, XMLSerializer: v_XS } = require('xmldom');

// Mock DOM for server-side
global.DOMParser = v_DP;
global.XMLSerializer = v_XS;

var { generateHmlFromTemplate: v_gen } = require('./src/lib/hml-v2/generator.ts');

var v_tPath = v_path.join(__dirname, '재조립양식.hml');
var v_tContent = v_fs.readFileSync(v_tPath, 'utf-8');

// Mock Data
var v_mockQ = [
    {
        question: {
            id: 'q1',
            content_xml: '<P data-hml-style="QUESTION"><TEXT CharShape="0">Question 1 Content</TEXT></P>',
            question_number: 1
        },
        images: []
    }
];

console.log('Generating HML...');
var v_genResult = v_gen(v_tContent, v_mockQ);
v_fs.writeFileSync('test_output_endnote.hml', v_genResult.hmlContent);
console.log('Saved to test_output_endnote.hml');
