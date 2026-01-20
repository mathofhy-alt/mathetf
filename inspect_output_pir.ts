import * as fs from 'fs';

const content = fs.readFileSync('test_hml_v2_output.hml', 'utf-8');
const search = '<PICTURE';
const index = content.indexOf(search);

if (index >= 0) {
    console.log('--- GENERATED PICTURE TAG ---');
    console.log(content.substring(index, index + 500));
} else {
    console.log('PICTURE tag not found in output');
}
