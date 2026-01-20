
import * as fs from 'fs';
import { DOMParser } from 'xmldom';

const targetFile = 'test_hml_v2_output.hml';
const referenceFile = 'repro_real_image.hml';

if (!fs.existsSync(targetFile) || !fs.existsSync(referenceFile)) {
    console.error('File not found');
    process.exit(1);
}

const targetContent = fs.readFileSync(targetFile, 'utf8');
const refContent = fs.readFileSync(referenceFile, 'utf8');

console.log('--- Order Verification in HEAD ---');

function getDirectChildrenTags(xml: string, parentTag: string): string[] {
    const start = xml.indexOf(`<${parentTag}`);
    if (start === -1) return [];

    // Naive extraction of block
    let end = xml.indexOf(`</${parentTag}>`);
    if (end === -1) end = xml.length;

    // We can't trust naive string slice if nested.
    // Use DOM.
    try {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const parent = doc.getElementsByTagName(parentTag)[0];
        if (!parent) return [];

        const tags: string[] = [];
        for (let i = 0; i < parent.childNodes.length; i++) {
            const node = parent.childNodes[i];
            if (node.nodeType === 1) { // Element
                tags.push(node.nodeName);
            }
        }
        return tags;
    } catch (e) {
        console.error('Parse Error', e);
        return [];
    }
}

const targetHeadOrder = getDirectChildrenTags(targetContent, 'HEAD');
const refHeadOrder = getDirectChildrenTags(refContent, 'HEAD');

console.log('Target HEAD Order:', targetHeadOrder.join(' -> '));
console.log('Ref HEAD Order:   ', refHeadOrder.join(' -> '));

if (JSON.stringify(targetHeadOrder) !== JSON.stringify(refHeadOrder)) {
    console.error('!!! HEAD ORDER MISMATCH !!!');
} else {
    console.log('HEAD Order Matches.');
}

console.log('\n--- Count Attribute Validation ---');

function validateCounts(xml: string, containerTag: string, itemTag: string) {
    try {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        const containers = doc.getElementsByTagName(containerTag);
        for (let i = 0; i < containers.length; i++) {
            const c = containers[i];
            const statedCount = parseInt(c.getAttribute('Count') || '-1');
            const actualItems = c.getElementsByTagName(itemTag).length;

            console.log(`<${containerTag}> Stated: ${statedCount}, Actual: ${actualItems}`);
            if (statedCount !== actualItems) {
                console.error(`!!! COUNT MISMATCH in ${containerTag} !!!`);
            }
        }
    } catch (e) { }
}

console.log('[Target File]');
validateCounts(targetContent, 'BINDATALIST', 'BINITEM');
validateCounts(targetContent, 'BINDATASTORAGE', 'BINDATA');

console.log('--- Body/Tail Boundary Check ---');
const lastPart = targetContent.slice(-500);
console.log('Last 500 chars of Target:', lastPart);

