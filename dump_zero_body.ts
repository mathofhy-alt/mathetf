
import * as fs from 'fs';

const content = fs.readFileSync('test_zero_output.hml', 'utf8');

const start = content.indexOf('<BODY');
const end = content.indexOf('</BODY>') + 7;

if (start !== -1 && end !== -1) {
    console.log(content.substring(start, end));
} else {
    console.log('BODY not found');
}
