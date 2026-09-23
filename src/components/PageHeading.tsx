import type { ReactNode } from 'react';
export default function PageHeading({eyebrow,title,description,children}:{eyebrow:string;title:string;description:string;children?:ReactNode}) {
 return <section className="suite-heading"><div><p className="suite-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="suite-description">{description}</p></div>{children&&<div className="suite-heading-action">{children}</div>}</section>;
}
