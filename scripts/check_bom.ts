
import fs from 'fs';

function checkBOM(filePath: string) {
    console.log(`\nChecking: ${filePath}`);
    const buffer = Buffer.alloc(10);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 10, 0);
    fs.closeSync(fd);

    console.log('Hex: ' + buffer.toString('hex').match(/.{1,2}/g)?.join(' '));

    if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        console.log('Detected UTF-8 BOM');
    } else if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        console.log('Detected UTF-16LE BOM');
    } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        console.log('Detected UTF-16BE BOM');
    } else {
        console.log('No BOM detected or Unknown');
    }
}

function checkMisplacedBOM(filePath: string) {
    const content = fs.readFileSync(filePath, 'utf8');
    const bomIndex = content.indexOf('\uFEFF');
    if (bomIndex !== -1) {
        console.log(`Misplaced BOM (\uFEFF) found in ${filePath} at index ${bomIndex}`);
        console.log(`Surrounding context: "${content.substring(Math.max(0, bomIndex - 20), bomIndex + 20)}"`);
    } else {
        console.log(`No misplaced BOM found in ${filePath}`);
    }
}

checkBOM('diagnose_v3_binary.hml');
checkMisplacedBOM('diagnose_v3_binary.hml');

checkBOM('output_cycle_test.hml');
checkMisplacedBOM('output_cycle_test.hml');

checkBOM('template.hml');
checkMisplacedBOM('template.hml');
