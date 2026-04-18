const xml = '<TEXT CharShape="11"><ENDNOTE>'; 
const res = xml.replace(/<TEXT\s+CharShape="[^"]*"(\s[^>]*)?>(<ENDNOTE>|<hp:ENDNOTE>)/gi, (m) => m.replace(/CharShape="[^"]*"/, 'CharShape="14"')); 
console.log('res:', res);
