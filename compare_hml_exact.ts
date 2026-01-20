
import * as fs from 'fs';
import { DOMParser } from 'xmldom';

const targetFile = 'test_hml_v2_output.hml';
const referenceFile = 'repro_real_image.hml';

const targetContent = fs.readFileSync(targetFile, 'utf8');
const refContent = fs.readFileSync(referenceFile, 'utf8');

const tDoc = new DOMParser().parseFromString(targetContent, 'text/xml');
const rDoc = new DOMParser().parseFromString(refContent, 'text/xml');

console.log('--- Metadata Comparison (HEAD & TAIL) ---');

function findTag(doc: Document, name: string): Element | null {
    const els = doc.getElementsByTagName('*');
    for (let i = 0; i < els.length; i++) {
        if (els[i].localName === name) return els[i];
    }
    return null;
}

function compareNodeAttrs(tNode: Element | null, rNode: Element | null, path: string) {
    console.log(`[Check] ${path}: Target=${!!tNode}, Ref=${!!rNode}`);
    if (!tNode && !rNode) return;
    if (!tNode) { console.error(`  ERR: Missing in Target: ${path}`); return; }
    if (!rNode) { console.error(`  ERR: Extra in Target: ${path}`); return; }

    const tAttrs = tNode.attributes;
    const rAttrs = rNode.attributes;

    const tMap = new Map();
    for (let i = 0; i < tAttrs.length; i++) tMap.set(tAttrs[i].name, tAttrs[i].value);

    const rMap = new Map();
    for (let i = 0; i < rAttrs.length; i++) rMap.set(rAttrs[i].name, rAttrs[i].value);

    rMap.forEach((val, key) => {
        if (!tMap.has(key)) console.warn(`  WARN: Attr Missing in Target: ${path}@${key} (Ref: ${val})`);
        else if (tMap.get(key) !== val) {
            console.log(`  DIFF: ${path}@${key}: Target="${tMap.get(key)}", Ref="${val}"`);
        }
    });

    tMap.forEach((val, key) => {
        if (!rMap.has(key)) console.warn(`  WARN: Attr Extra in Target: ${path}@${key} (Val: ${val})`);
    });
}

// Global tags
compareNodeAttrs(findTag(tDoc, 'HWPML'), findTag(rDoc, 'HWPML'), 'HWPML');
compareNodeAttrs(findTag(tDoc, 'DOCSETTING'), findTag(rDoc, 'DOCSETTING'), 'DOCSETTING');
compareNodeAttrs(findTag(tDoc, 'BEGINNUMBER'), findTag(rDoc, 'BEGINNUMBER'), 'BEGINNUMBER');
compareNodeAttrs(findTag(tDoc, 'BORDERFILLLIST'), findTag(rDoc, 'BORDERFILLLIST'), 'BORDERFILLLIST');

// Check first PICTURE in both
const findNestedTag = (parent: Element, name: string) => {
    const els = parent.getElementsByTagName('*');
    for (let i = 0; i < els.length; i++) {
        if (els[i].localName === name) return els[i];
    }
    return null;
};

const tPics = tDoc.getElementsByTagNameNS('*', 'PICTURE');
const rPics = rDoc.getElementsByTagNameNS('*', 'PICTURE');
if (tPics.length > 0 && rPics.length > 0) {
    const tPic = tPics[0] as Element;
    const rPic = rPics[0] as Element;
    compareNodeAttrs(tPic, rPic, 'PICTURE[0]');

    compareNodeAttrs(findNestedTag(tPic, 'SHAPEOBJECT'), findNestedTag(rPic, 'SHAPEOBJECT'), 'PICTURE[0]/SHAPEOBJECT');
    compareNodeAttrs(findNestedTag(tPic, 'SIZE'), findNestedTag(rPic, 'SIZE'), 'PICTURE[0]/SIZE');
    compareNodeAttrs(findNestedTag(tPic, 'POSITION'), findNestedTag(rPic, 'POSITION'), 'PICTURE[0]/POSITION');
}

console.log('\n--- BinData Ref Consistency ---');

const checkRef = (doc: any, name: string) => {
    const pics = doc.getElementsByTagNameNS('*', 'PICTURE');
    if (pics.length > 0) {
        const pic = pics[0];
        const picRef = pic.getAttribute('BinData');
        console.log(`[${name}] PICTURE BinData="${picRef}"`);

        const binItems = doc.getElementsByTagNameNS('*', 'BINITEM');
        // Find BINITEM with matching BinData
        let matchedItem = null;
        for (let i = 0; i < binItems.length; i++) {
            if (binItems[i].getAttribute('BinData') === picRef) matchedItem = binItems[i];
        }
        console.log(`[${name}] BINITEM(match) Found="${!!matchedItem}"`);

        const binDatas = doc.getElementsByTagNameNS('*', 'BINDATA');
        // Find BINDATA with matching Id
        let matchedData = null;
        for (let i = 0; i < binDatas.length; i++) {
            if (binDatas[i].getAttribute('Id') === picRef) matchedData = binDatas[i];
        }
        console.log(`[${name}] BINDATA(match) Found="${!!matchedData}"`);
    }
};

checkRef(rDoc, 'Ref');
checkRef(tDoc, 'Target');
