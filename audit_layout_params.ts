
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const pControl = path.join(process.cwd(), '20260128디버깅대조군.hml');
const pDebug = path.join(process.cwd(), 'debug_last_output.hml');

const cControl = fs.readFileSync(pControl, 'utf-8');
const cDebug = fs.readFileSync(pDebug, 'utf-8');

const dumpLayout = (xml: string, label: string) => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');

    // SECDEF -> PAGEDEF
    const pd = doc.getElementsByTagName('PAGEDEF')[0];
    if (pd) {
        console.log(`[${label}] PageDef: W=${pd.getAttribute('Width')} H=${pd.getAttribute('Height')} Landscape=${pd.getAttribute('Landscape')} Top=${pd.getAttribute('TopMargin')} Bottom=${pd.getAttribute('BottomMargin')} Left=${pd.getAttribute('LeftMargin')} Right=${pd.getAttribute('RightMargin')} Gutter=${pd.getAttribute('GutterLen')}`);
    } else {
        console.log(`[${label}] PAGEDEF MISSING`);
    }

    // COLDEF
    const cd = doc.getElementsByTagName('COLDEF')[0];
    if (cd) {
        console.log(`[${label}] ColDef: Count=${cd.getAttribute('Count')} Layout=${cd.getAttribute('Layout')} Gap=${cd.getAttribute('SameGap')} Size=${cd.getAttribute('SameSize')}`);
    } else {
        console.log(`[${label}] COLDEF MISSING (First one)`);
    }

    // Check Child[0] of SECTION
    const section = doc.getElementsByTagName('SECTION')[0];
    if (section && section.firstChild) {
        // xml serializer needed?
    }
};

dumpLayout(cControl, 'Control');
dumpLayout(cDebug, 'Debug');
