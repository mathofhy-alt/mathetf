
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function inspect() {
    const templatePath = path.join(process.cwd(), 'public', 'template.hwpx');
    console.log("Checking template at:", templatePath);

    if (!fs.existsSync(templatePath)) {
        console.error("File not found!");
        return;
    }

    const data = fs.readFileSync(templatePath);
    const zip = await JSZip.loadAsync(data);

    // List files
    console.log("Files in ZIP:", Object.keys(zip.files));

    const section0 = await zip.file("Contents/section0.xml")?.async("string");
    if (!section0) {
        console.error("Missing Contents/section0.xml");
        return;
    }

    console.log("--- section0.xml Start ---");
    console.log(section0.substring(0, 500));
    console.log("--- section0.xml End of Head ---");
}

inspect();
