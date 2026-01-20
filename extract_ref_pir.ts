import * as fs from 'fs';

const content = fs.readFileSync('repro_real_image.hml', 'utf-8');

const listIdx = content.indexOf('<BINDATALIST');
const mappingIdx = content.indexOf('<MAPPINGTABLE');
const mappingEndIdx = content.indexOf('</MAPPINGTABLE>');

if (listIdx >= 0) {
    console.log('BINDATALIST index:', listIdx);
    if (mappingIdx >= 0 && mappingEndIdx >= 0) {
        console.log('MAPPINGTABLE start:', mappingIdx, 'end:', mappingEndIdx);
        if (listIdx > mappingIdx && listIdx < mappingEndIdx) {
            console.log('CONFIRMED: BINDATALIST is INSIDE MAPPINGTABLE');
        } else {
            console.log('WARNING: BINDATALIST is OUTSIDE MAPPINGTABLE');
        }
    } else {
        console.log('MAPPINGTABLE not found');
    }
} else {
    console.log('BINDATALIST not found');
}
