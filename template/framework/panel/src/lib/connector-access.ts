export type ToolScope={allow?:string[];deny?:string[]};
const piOriginSelector='mcp:agents:list_threads';
// Pi obtains the exact current conversation from OMB's per-turn agents mount.
// Respect an explicit denial: removing a wildcard deny would grant other tools.
export function piHumanRequestOriginBlocked(scope:ToolScope|undefined):boolean {
  if(scope?.deny?.some(s=>s==='mcp:agents:*'||s===piOriginSelector))return true;
  return !!scope?.allow&&!scope.allow.includes('mcp:agents:*')&&!scope.allow.includes(piOriginSelector);
}
export function ensurePiHumanRequestOrigin(scope:ToolScope|undefined):ToolScope|undefined {
  if(!scope?.allow || scope.allow.length >= 256 || scope.deny?.some(s=>s==='mcp:agents:*'||s===piOriginSelector) ||
      scope.allow.includes('mcp:agents:*') || scope.allow.includes(piOriginSelector))return scope;
  return {...scope,allow:[...scope.allow,piOriginSelector]};
}
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
