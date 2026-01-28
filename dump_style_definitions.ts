
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const pDebug = path.join(process.cwd(), 'debug_last_output.hml');
const cDebug = fs.readFileSync(pDebug, 'utf-8');
const doc = new DOMParser().parseFromString(cDebug, 'text/xml');

const dumpParaShape = (id: string) => {
    const shapes = doc.getElementsByTagName('PARASHAPE');
    for (let i = 0; i < shapes.length; i++) {
        if (shapes[i].getAttribute('Id') === id) {
            const m = shapes[i].getElementsByTagName('PARAMARGIN')[0];
            console.log(`ParaShape[${id}]: LineSpacing=${shapes[i].getAttribute('LineSpacing')} HeadingType=${shapes[i].getAttribute('HeadingType')}`);
            if (m) console.log(`   Margin: Left=${m.getAttribute('Left')} Right=${m.getAttribute('Right')} LineSpacingMethod=${m.getAttribute('LineSpacingMethod')}`);
        }
    }
};

const dumpCharShape = (id: string) => {
    const shapes = doc.getElementsByTagName('CHARSHAPE');
    for (let i = 0; i < shapes.length; i++) {
        if (shapes[i].getAttribute('Id') === id) {
            const f = shapes[i].getElementsByTagName('FONTID')[0];
            console.log(`CharShape[${id}]: Height=${shapes[i].getAttribute('Height')} TextColor=${shapes[i].getAttribute('TextColor')}`);
            if (f) console.log(`   FontId: Hangul=${f.getAttribute('Hangul')} Latin=${f.getAttribute('Latin')} Hanja=${f.getAttribute('Hanja')}`);
        }
    }
};

console.log('--- Style Definitions ---');
dumpParaShape('1'); // Used by P[0]
dumpCharShape('0'); // Used by P[0] TEXT

// Check FONT 0
const fonts = doc.getElementsByTagName('FONT');
for (let i = 0; i < fonts.length; i++) {
    if (fonts[i].getAttribute('Id') === '0') {
        console.log(`FONT[0]: Name=${fonts[i].getAttribute('Name')} Type=${fonts[i].getAttribute('Type')}`);
    }
}
