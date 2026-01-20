
import * as fs from 'fs';
import { DOMParser, XMLSerializer } from 'xmldom';

const content = fs.readFileSync('repro_real_image.hml', 'utf8');
const parser = new DOMParser();
const serializer = new XMLSerializer();
const doc = parser.parseFromString(content, 'text/xml');

const output = serializer.serializeToString(doc);
fs.writeFileSync('test_zero_questions.hml', output);
console.log('Zero-question HML saved to test_zero_questions.hml');
