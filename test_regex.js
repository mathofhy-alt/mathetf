
const templateContent = `
<HML>
<HEAD>
<DOCSETTINGS>
    <STYLE Id="1" Name="Normal" ParaShape="1"/>
    <STYLE Id="2" Name="문제1" ParaShape="55"/>
</DOCSETTINGS>
<PARAS>
    <PARASHAPE Id="1" Align="Left"/>
    <PARASHAPE Id="55" HeadingType="Number" Indent="100"/>
    <PARASHAPE Id="99" HeadingType="Bullet"/>
</PARAS>
</HEAD>
</HML>
`;

try {
    console.log("Starting RegEx Test...");
    const styleMatch = templateContent.match(/<STYLE [^>]*Name="문제1"[^>]*ParaShape="(\d+)"/);
    if (styleMatch) {
        const targetParaId = styleMatch[1];
        console.log(`Found ParaId: ${targetParaId}`);
        // Regex to find the specific PARASHAPE tag with Id="targetParaId"
        // We look for HeadingType="Number" and replace with "None"
        const paraRegex = new RegExp(`(<PARASHAPE [^>]*Id="${targetParaId}"[^>]*HeadingType=")Number(")`);

        console.log(`Regex: ${paraRegex}`);
        if (paraRegex.test(templateContent)) {
            const newContent = templateContent.replace(paraRegex, '$1None$2');
            console.log("Match Found & Replaced!");
            console.log(newContent);
        } else {
            console.log("No Match for HeadingType='Number'");
        }
    } else {
        console.log("Style '문제1' not found");
    }
    console.log("Done.");
} catch (e) {
    console.error("CRASHED:", e);
}
