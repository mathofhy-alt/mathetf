
import * as fs from 'fs';
import { generateHmlFromTemplate } from './src/lib/hml-v2/generator';

const template = fs.readFileSync('repro_real_image.hml', 'utf8');
const result = generateHmlFromTemplate(template, []);

fs.writeFileSync('test_zero_output.hml', result.hmlContent, 'utf8');
console.log('Generated test_zero_output.hml');
