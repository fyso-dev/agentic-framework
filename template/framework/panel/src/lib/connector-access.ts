export type ToolScope={allow?:string[];deny?:string[]};
const prefix=(name:string)=>`mcp:${name}:`;
export function accessFor(scope:ToolScope|undefined,name:string):'all'|'some'|'none' {
  const p=prefix(name),wildcard=p+'*';
  if(scope?.deny?.includes(wildcard))return 'none';
  const selected=scope?.allow?.filter(s=>s.startsWith(p));
  if(selected && !selected.length)return 'none';
  if(selected && !selected.includes(wildcard))return selected.some(s=>!scope?.deny?.includes(s))?'some':'none';
  return scope?.deny?.some(s=>s.startsWith(p))?'some':'all';
}
// Only change this server's selectors. Preserve other servers and native tools.
export function selectServer(scope:ToolScope|undefined,name:string,enabled:boolean):ToolScope {
  const p=prefix(name),wildcard=p+'*',next={...scope};
  if(next.allow)next.allow=next.allow.filter(s=>!s.startsWith(p));
  next.deny=(next.deny||[]).filter(s=>!s.startsWith(p));
  if(enabled){if(next.allow)next.allow.push(wildcard);}
  else next.deny.push(wildcard);
  if(!next.deny.length)delete next.deny;
  return next;
}
