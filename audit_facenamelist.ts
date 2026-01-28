
import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from 'xmldom';

const pControl = path.join(process.cwd(), '20260128디버깅대조군.hml');
const pDebug = path.join(process.cwd(), 'debug_last_output.hml');

const cControl = fs.readFileSync(pControl, 'utf-8');
const cDebug = fs.readFileSync(pDebug, 'utf-8');

const dumpFaces = (xml: string, label: string) => {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const faces = doc.getElementsByTagName('FONTFACE');
    console.log(`[${label}] FontFaces: ${faces.length}`);
    for (let i = 0; i < faces.length; i++) {
        const lang = faces[i].getAttribute('Lang');
        const fonts = faces[i].getElementsByTagName('FONT');
        console.log(`  Face Lang=${lang} Count=${faces[i].getAttribute('Count')}`);
        for (let j = 0; j < Math.min(3, fonts.length); j++) {
            console.log(`    Font[${j}] Id=${fonts[j].getAttribute('Id')} Name=${fonts[j].getAttribute('Name')} Type=${fonts[j].getAttribute('Type')}`);
        }
    }

    // DOCSETTINGS
    const ds = doc.getElementsByTagName('DOCSETTINGS')[0];
    if (ds) {
        // Check for View properties? No, usually in VIEWSETTINGS. Not in HML.
        // Check TrackChange?
        // In HWPML 2.1, TrackChange might be in DOCSUMMARY?
    }
};

dumpFaces(cControl, 'Control');
dumpFaces(cDebug, 'Debug');
