
import * as fs from 'fs';

const targetFile = 'test_hml_v2_output.hml';
const content = fs.readFileSync(targetFile, 'utf8');

const start = content.indexOf('<BODY');
const end = content.indexOf('</BODY>') + 7;

if (start !== -1 && end !== -1) {
    // Show the last 5000 chars of the body
    console.log(content.substring(Math.max(start, end - 5000), end));
} else {
    console.log('BODY not found');
}
