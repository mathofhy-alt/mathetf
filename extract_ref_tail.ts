import * as fs from 'fs';

const f = fs.readFileSync('repro_real_image.hml', 'utf8');
const tStart = f.indexOf('<TAIL');
const tEnd = f.indexOf('</TAIL>');
const bStart = f.indexOf('<BINDATASTORAGE');

console.log('--- REPRO TAIL EXTRACT ---');
console.log('TAIL Start:', tStart);
console.log('TAIL End:', tEnd);
console.log('BINDATASTORAGE Start:', bStart);
console.log('Is BINDATASTORAGE inside TAIL?', (bStart > tStart && bStart < tEnd));

if (tStart >= 0) {
    console.log('--- RAW TAIL CONTENT ---');
    console.log(f.substring(tStart, tStart + 500));
}
if (bStart >= 0) {
    console.log('--- BINDATASTORAGE CONTENT ---');
    console.log(f.substring(bStart, bStart + 200));
}
