
import * as fs from 'fs';

const content = fs.readFileSync('repro_real_image.hml', 'utf8');
const index = content.indexOf('Image Test Below');

if (index !== -1) {
    console.log(`Context before: "${content.substring(index - 50, index)}"`);
    console.log(`Target: "${content.substring(index, index + 16)}"`);
    console.log(`Context after: "${content.substring(index + 16, index + 66)}"`);
} else {
    console.log('Text not found');
}
