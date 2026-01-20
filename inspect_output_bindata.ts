import * as fs from 'fs';

const content = fs.readFileSync('test_hml_v2_output.hml', 'utf-8');

const listIdx = content.indexOf('<BINDATALIST');
if (listIdx >= 0) {
    console.log('--- GENERATED BINDATALIST ---');
    console.log(content.substring(listIdx, listIdx + 300));
}

const storageIdx = content.indexOf('<BINDATASTORAGE');
if (storageIdx >= 0) {
    console.log('--- GENERATED BINDATASTORAGE ---');
    console.log(content.substring(storageIdx, storageIdx + 300));
}
