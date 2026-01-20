import * as fs from 'fs';

const content = fs.readFileSync('재조립양식.hml', 'utf-8');
const search = '<MAPPINGTABLE';
const endSearch = '</MAPPINGTABLE>';
const index = content.indexOf(search);
const endIndex = content.indexOf(endSearch);

if (index >= 0 && endIndex >= 0) {
    console.log('--- TEMPLATE MAPPINGTABLE ---');
    console.log(content.substring(index, endIndex + endSearch.length).slice(0, 1000));
} else {
    console.log('MAPPINGTABLE not found in template');
}
