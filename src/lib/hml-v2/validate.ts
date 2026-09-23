import { DOMParser } from 'xmldom';
export function escapeXml(value: string): string {
    return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
export function examFilename(title: string): string {
    return (title.replace(/[\x00-\x1f\x7f\\/<>:"|?*]/g,'_').replace(/[. ]+$/g,'').slice(0,100).trim() || '시험지') + '.hml';
}
export function validateHml(xml: string): void {
    const errors:string[]=[];
    const doc=new DOMParser({errorHandler:{warning:m=>errors.push(m),error:m=>errors.push(m),fatalError:m=>errors.push(m)}}).parseFromString(xml,'text/xml');
    if(errors.length || doc.documentElement?.tagName!=='HWPML' || !doc.getElementsByTagName('BODY').length || !doc.getElementsByTagName('SECTION').length) throw new Error('시험지 파일 구조를 확인하지 못했습니다. 원본 문항을 확인해주세요.');
    const bins=doc.getElementsByTagName('BINITEM'), blobs=doc.getElementsByTagName('BINDATA');
    const stored=new Set<string>();
    for(let i=0;i<blobs.length;i++) {
        const id=blobs[i].getAttribute('Id') || '';
        if(!id || stored.has(id) || !blobs[i].textContent?.trim()) throw new Error('시험지의 그림 데이터가 올바르지 않습니다.');
        stored.add(id);
    }
    for(let i=0;i<bins.length;i++) if(!stored.has(bins[i].getAttribute('BinData') || '')) throw new Error('시험지의 그림 파일이 누락되었습니다.');
    const nodes=doc.getElementsByTagName('*');
    for(let i=0;i<nodes.length;i++) {
        if(['IMAGE','PICTURE'].includes(nodes[i].tagName) && !nodes[i].hasAttribute('BinItem') && nodes[i].hasAttribute('BinData') && !stored.has(nodes[i].getAttribute('BinData') || '')) throw new Error('시험지 그림의 원본 연결이 누락되었습니다.');
        const value=nodes[i].getAttribute('BinItem');
        if(value!==null && value!=='') {
            const index=Number(value);
            if(!Number.isInteger(index) || index<1 || index>bins.length) throw new Error('시험지 문항의 그림 연결이 누락되었습니다.');
        }
    }
}

export function validateQuestionXml(xml:string):void {
    const errors:string[]=[];
    new DOMParser({errorHandler:{warning:m=>errors.push(m),error:m=>errors.push(m),fatalError:m=>errors.push(m)}}).parseFromString(`<ROOT>${xml}</ROOT>`,'text/xml');
    if(errors.length) throw new Error('문항 원본의 파일 구조에 오류가 있습니다.');
}
