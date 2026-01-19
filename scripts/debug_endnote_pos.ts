
import fs from 'fs';
import path from 'path';

function findPBlockEnd(xml: string, pStart: number): number {
    const closeRe = /<\/(?:[a-zA-Z0-9]+:)?P>/gi;
    closeRe.lastIndex = pStart;
    const m = closeRe.exec(xml);
    if (!m) return -1;
    return m.index + m[0].length;
}

function findPrevPStart(xml: string, pos: number): number {
    const re = /<(?:[a-zA-Z0-9]+:)?P\b[^>]*>/gi;
    let match: RegExpExecArray | null;
    let last = -1;
    while ((match = re.exec(xml)) !== null) {
        if (match.index >= pos) break;
        last = match.index;
    }
    return last;
}

const file = path.join(process.cwd(), '테스트.hml');
const content = fs.readFileSync(file, 'utf-8');

const endnoteRe = /<(?:[a-zA-Z0-9]+:)?ENDNOTE\b/gi;
let m;
let count = 0;
let outsideCount = 0;

while ((m = endnoteRe.exec(content)) !== null) {
    count++;
    const pos = m.index;
    const pStart = findPrevPStart(content, pos);

    if (pStart === -1) {
        console.log(`Endnote ${count} at ${pos}: No previous P found.`);
        outsideCount++;
        continue;
    }

    const pEnd = findPBlockEnd(content, pStart);

    if (pos >= pStart && pos < pEnd) {
        // Inside
    } else {
        console.log(`Endnote ${count} at ${pos} is OUTSIDE P (P: ${pStart} ~ ${pEnd})`);
        outsideCount++;
    }
}

console.log(`Total Endnotes: ${count}`);
console.log(`Total Outside: ${outsideCount}`);
