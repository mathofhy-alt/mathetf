
import * as fs from 'fs';
import * as path from 'path';

const filePath = path.join(process.cwd(), 'debug_last_output.hml');
if (!fs.existsSync(filePath)) {
    console.error('File not found');
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
const start = content.indexOf('<PARASHAPELIST');
const end = content.indexOf('</PARASHAPELIST>');

if (start !== -1 && end !== -1) {
    console.log(content.substring(start, end + 16));
} else {
    console.log('PARASHAPELIST not found');
}

const charStart = content.indexOf('<CHARSHAPELIST');
const charEnd = content.indexOf('</CHARSHAPELIST>');

if (charStart !== -1 && charEnd !== -1) {
    console.log(content.substring(charStart, charEnd + 16));
}
