
import * as fs from 'fs';

const content = fs.readFileSync('test_hml_v2_output.hml', 'utf8');
const bodyEnd = content.indexOf('</BODY>');
const body = content.substring(0, bodyEnd);
const lastChars = body.substring(body.length - 2000);

console.log('=== LAST 2000 CHARS OF BODY ===');
console.log(lastChars);
