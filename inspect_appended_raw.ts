
import * as fs from 'fs';

const filename = 'test_hml_v2_output.hml';
const content = fs.readFileSync(filename, 'utf8');

const target = 'NEWLY APPENDED QUESTION CONTENT';
const index = content.indexOf(target);

if (index !== -1) {
    console.log(`--- FOUND APPENDED CONTENT AT INDEX ${index} ---`);
    console.log('SURROUNDING XML (1000 chars):');
    console.log(content.substring(index - 500, index + 500));
} else {
    console.log('--- APPENDED CONTENT NOT FOUND IN FILE! ---');
    // Dump last 2000 chars of body to see where it went
    const bodyEnd = content.indexOf('</BODY>');
    if (bodyEnd !== -1) {
        console.log('LAST 2000 CHARS BEFORE </BODY>:');
        console.log(content.substring(bodyEnd - 2000, bodyEnd + 7));
    }
}
