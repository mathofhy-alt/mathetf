const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'test_hml_v2_real_output.hml');
const content = fs.readFileSync(filePath, 'utf8');

const search = (tag) => {
    const index = content.indexOf(tag);
    if (index >= 0) {
        console.log(`Found ${tag} at index ${index}:`);
        console.log(content.substring(index, index + 500));
    } else {
        console.log(`${tag} NOT FOUND`);
    }
};

search('<PICTURE');
search('<IMAGE');
search('BinData="1"');
search('BinData="yyyyyyy"');
