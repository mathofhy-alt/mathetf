import * as fs from 'fs';

function inspect(filename: string, label: string) {
    const content = fs.readFileSync(filename, 'utf-8');
    const search = '<PICTURE';
    const index = content.indexOf(search);

    if (index >= 0) {
        console.log(`--- ${label} ---`);
        // Extract 400 chars BEFORE and 800 chars AFTER to see parent/child context
        const start = Math.max(0, index - 400);
        const end = Math.min(content.length, index + 800);
        console.log(content.substring(start, end));
    } else {
        console.log(`${label}: PICTURE tag not found`);
    }
}

inspect('repro_real_image.hml', 'WORKING REFERENCE');
inspect('test_hml_v2_output.hml', 'GENERATED OUTPUT');
