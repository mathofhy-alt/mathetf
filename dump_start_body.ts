
import * as fs from 'fs';

const content = fs.readFileSync('test_hml_v2_output.hml', 'utf8');
const bodyStart = content.indexOf('<BODY>');
const bodyEnd = content.indexOf('</BODY>');
const body = content.substring(bodyStart, bodyEnd + 7);

console.log('=== FIRST 2000 CHARS OF BODY ===');
console.log(body.substring(0, 2000));
