
import { DOMParser } from 'xmldom';
import * as fs from 'fs';

const filePath = 'test_hml_v2_output.hml';

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const doc = new DOMParser().parseFromString(content, 'text/xml');

// 1. Collect Definitions
const definitions = {
    ParaShape: new Set<string>(),
    CharShape: new Set<string>(),
    Style: new Set<string>(),
    BorderFill: new Set<string>(),
    BinData: new Set<string>(),
    TabDef: new Set<string>(),
    Numbering: new Set<string>(),
    Font: new Set<string>(),
};

const mappingTable = doc.getElementsByTagName('MAPPINGTABLE')[0];
if (mappingTable) {
    const collectIds = (tagName: string, set: Set<string>, idAttr = 'Id') => {
        const elements = mappingTable.getElementsByTagName(tagName);
        for (let i = 0; i < elements.length; i++) {
            set.add(elements[i].getAttribute(idAttr) || '');
        }
    };

    collectIds('PARASHAPE', definitions.ParaShape);
    collectIds('CHARSHAPE', definitions.CharShape);
    collectIds('STYLE', definitions.Style);
    collectIds('BORDERFILL', definitions.BorderFill);
    collectIds('TABDEF', definitions.TabDef);
    collectIds('NUMBERING', definitions.Numbering);
    // Fonts are nested in FONTFACE, tricky.
}

// BinData is in BINDATALIST
const bindataList = doc.getElementsByTagName('BINDATALIST')[0];
if (bindataList) {
    const items = bindataList.getElementsByTagName('BINITEM');
    for (let i = 0; i < items.length; i++) {
        definitions.BinData.add(items[i].getAttribute('BinData') || '');
    }
}
// Also check BINDATASTORAGE just in case
const storage = doc.getElementsByTagName('BINDATASTORAGE')[0];
if (storage) {
    const items = storage.getElementsByTagName('BINDATA');
    for (let i = 0; i < items.length; i++) {
        definitions.BinData.add(items[i].getAttribute('Id') || '');
    }
}


console.log('--- Definitions Found ---');
console.log(`ParaShapes: ${definitions.ParaShape.size}`);
console.log(`CharShapes: ${definitions.CharShape.size}`);
console.log(`Styles:     ${definitions.Style.size}`);
console.log(`Images:     ${definitions.BinData.size}`);


// 2. Scan Body for References
const body = doc.getElementsByTagName('BODY')[0];
const errors: string[] = [];
let checked = 0;

const scanNode = (node: Element) => {
    if (node.nodeType !== 1) return;
    checked++;

    const checkAttr = (attr: string, set: Set<string>, name: string) => {
        const val = node.getAttribute(attr);
        if (val !== null && val !== '') {
            // Some attributes might be "14" or "14 15". Assume single ID for these core ones?
            // ParaShape, CharShape, BinData are single.
            if (!set.has(val)) {
                errors.push(`[Missing Ref] <${node.tagName}> uses ${name}="${val}" but ID not defined.`);
            }
        }
    };

    checkAttr('ParaShape', definitions.ParaShape, 'ParaShape');
    checkAttr('CharShape', definitions.CharShape, 'CharShape');
    checkAttr('Style', definitions.Style, 'Style');
    checkAttr('BorderFill', definitions.BorderFill, 'BorderFill');
    checkAttr('BinData', definitions.BinData, 'BinData');     // used in PICTURE
    checkAttr('BinItem', definitions.BinData, 'BinItem');     // sometimes BinItem

    // Recursive
    for (let i = 0; i < node.childNodes.length; i++) {
        scanNode(node.childNodes[i] as Element);
    }
};

if (body) {
    scanNode(body);
}

console.log('\n--- Inspection Results ---');
console.log(`Checked ${checked} elements.`);
if (errors.length > 0) {
    console.error(`FAILED: Found ${errors.length} dangling references!`);
    if (errors.length > 20) {
        console.log(errors.slice(0, 20).join('\n'));
        console.log(`... and ${errors.length - 20} more.`);
    } else {
        console.log(errors.join('\n'));
    }
} else {
    console.log('PASS: No dangling style/binary references found.');
}
