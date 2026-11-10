import { useState } from 'react';

// Logos are decorative; the adjacent service name remains the accessible label.
export function ConnectorLogo({logo,label}:{logo?:string|null;label:string}) {
  const [failed,setFailed]=useState<string>();
  let source:string|undefined;
  try {const url=new URL(logo||'');if(url.protocol==='https:'&&!url.username&&!url.password)source=url.href;}catch{/* Missing or invalid artwork uses initials. */}
  return <span className="connector-logo" aria-hidden="true">{source&&failed!==source?<img src={source} alt="" width={32} height={32} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(source)}/>:label.trim().slice(0,2).toUpperCase()}</span>;
}
