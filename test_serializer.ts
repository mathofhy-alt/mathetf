
import { DOMParser, XMLSerializer } from 'xmldom';

const doc = new DOMParser().parseFromString('<ROOT>  <P><TEXT/></P>  </ROOT>', 'text/xml');
const ps = doc.getElementsByTagName('P');
const serializer = new XMLSerializer();

const pXml = serializer.serializeToString(ps[0]);
console.log(`pXml: '${pXml}'`);
console.log(`Starts with <P? ${pXml.startsWith('<P')}`);
