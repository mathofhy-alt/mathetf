const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function inspectHeader() {
    const basePath = path.join(process.cwd(), 'base_template.hwpx');
    const data = fs.readFileSync(basePath);
    const zip = await JSZip.loadAsync(data);
    const header = await zip.file("Contents/header.xml").async("string");

    console.log("Header Length:", header.length);
    const match = header.match(/<hm:masterPage\b[\s\S]*?<\/hm:masterPage>/);
    if (match) {
        console.log("Master Page Definition FOUND:");
        console.log(match[0].substring(0, 200) + "...");
    } else {
        console.log("No Master Page Definition found.");
    }
}

inspectHeader();
