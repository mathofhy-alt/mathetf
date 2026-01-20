
import * as fs from 'fs';

const template = fs.readFileSync('재조립양식.hml', 'utf8');
const output = template.replace('{{CONTENT_HERE}}', 'HELLO WORLD - REPLACED MANUALLY');

fs.writeFileSync('manual_test.hml', output, 'utf8');
console.log('Created manual_test.hml');
