
import fs from 'fs';
import path from 'path';

const templatePath = path.join(process.cwd(), 'template.hml');
const templateXml = fs.readFileSync(templatePath, 'utf-8');

// Current Regex
const regex1 = /<P[^>]*>[\s\S]*?<SECDEF[\s\S]*?<\/SECDEF>[\s\S]*?<\/P>/i;
const match1 = templateXml.match(regex1);
console.log("Regex 1 Match:", match1 ? "YES" : "NO");
if (match1) console.log(match1[0].substring(0, 100) + "...");

// Improved Regex (Focus on SECDEF inside TEXT inside P?)
// Or just extract P that contains SECDEF
// <P ...><TEXT ...><SECDEF ...
const regex2 = /<P\b[^>]*>(?:(?!<\/P>)[\s\S])*<SECDEF[\s\S]*?<\/SECDEF>(?:(?!<\/P>)[\s\S])*<\/P>/i;
const match2 = templateXml.match(regex2);
console.log("Regex 2 Match:", match2 ? "YES" : "NO");
if (match2) console.log(match2[0].substring(0, 100) + "...");

// Just find SECDEF and then expand?
const secdefStart = templateXml.indexOf('<SECDEF');
console.log("SECDEF Index:", secdefStart);
if (secdefStart !== -1) {
    const pStart = templateXml.lastIndexOf('<P', secdefStart);
    const pEnd = templateXml.indexOf('</P>', secdefStart) + 4;
    console.log(`Manual Scan: P Start ${pStart}, P End ${pEnd}`);
    console.log("Extracted:", templateXml.substring(pStart, pEnd).substring(0, 100) + "...");
}
