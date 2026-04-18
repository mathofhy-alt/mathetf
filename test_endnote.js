const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const fs = require('fs');

const xml = '<P data-hml-style=\"QUESTION\" Style=\"1\"><TEXT CharShape=\"11\"><ENDNOTE>Content</ENDNOTE></TEXT></P>';

// Simulating generator's content_xml replacement
let cleanContent = xml.replace(/<TEXT\\s+CharShape=\"[^\"]*\"(\\s[^>]*)?>(<ENDNOTE>|<hp:ENDNOTE>)/gi,
    (match) => match.replace(/CharShape=\"[^\"]*\"/, 'CharShape=\"14\"'));

console.log('After regex:', cleanContent);

const parser = new DOMParser();
const qDoc = parser.parseFromString('<WRAP>' + cleanContent + '</WRAP>', 'text/xml');
const root = qDoc.documentElement;

const serializer = new XMLSerializer();

// Apply style
const p = root.getElementsByTagName('P')[0];

console.log('After parsing:', serializer.serializeToString(root));

// Sanitize simulation
let forcedCs = '11';
function sanitize(node, forcedCs) {
    if (node.nodeType !== 1) return;
    
    if (forcedCs && (node.tagName === 'TEXT' || node.tagName === 'CHARSHAPE')) {
        const hasDirectEndnote = Array.from(node.childNodes || []).some(
            (n) => n.nodeName === 'ENDNOTE' || n.nodeName === 'hp:ENDNOTE'
        );
        if (!hasDirectEndnote) {
            node.setAttribute('CharShape', forcedCs);
        }
    }

    for (let i = 0; i < node.childNodes.length; i++) {
        sanitize(node.childNodes[i], forcedCs);
    }
}

sanitize(p, forcedCs);
console.log('After sanitize:', serializer.serializeToString(root));
