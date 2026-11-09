// Native OMB connector API through the project's authenticated, restricted gateway.
export type NativeServer={name:string;enabled:boolean;auth?:string;type?:string;url?:string;headerKeys?:string[];envKeys?:string[];offFor?:string[];bot?:string};
// Official hosted MCP entries shipped in OMB 0.1.141's PluginsPanel.
export const directMcp=[
  {id:'whop',label:'Whop',url:'https://mcp.whop.com/mcp'},
  {id:'agentcard',label:'Agentcard',url:'https://mcp.agentcard.sh/mcp'},
] as const;
export type AppCard={slug:string;label:string;blurb:string;logo?:string|null};
export type AppCatalog={configured:boolean;cards:AppCard[];source:string;pagination?:{complete:boolean}};
export type Account={id:string;alias?:string;status:string};
export type AppState={connected:boolean;pending?:boolean;accounts?:Account[]};
export type ConnectedApps={configured:boolean;services:Record<string,AppState>;inventoryComplete?:boolean};
export type Probe={ok:boolean;tools?:{name:string;description?:string}[];auth?:string;reason?:string};
export type SignIn={flowId:string;phase:string;authorizationUrl?:string|null;pasteBack?:boolean};
export type ServerInput={name:string;type?:'http'|'sse';url?:string;command?:string;args?:string[];headers?:Record<string,string>};
export class ConnectorError extends Error {
  constructor(public status:number){super(`Connector API: ${status}`);}
}
async function request<T>(route:string,method='GET',body?:unknown):Promise<T> {
  const response=await fetch(`api/omb/${route}`,{method,credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===401)window.dispatchEvent(new Event('fyso-session-expired'));
  // Never display arbitrary provider error bodies: they can contain credentials.
  if(!response.ok)throw new ConnectorError(response.status);
  return response.json() as Promise<T>;
}
const server=(name:string)=>`mcp/servers/${encodeURIComponent(name)}`;
export const connectors={
  catalog:()=>request<AppCatalog>('connectors/catalog'),
  connected:()=>request<ConnectedApps>('connectors/connected'),
  authorizeApp:(slug:string,alias:string)=>request<{url:string}>(`connectors/${encodeURIComponent(slug)}/authorize`,'POST',{alias}),
  removeAccount:(slug:string,id:string)=>request(`connectors/${encodeURIComponent(slug)}/accounts/${encodeURIComponent(id)}`,'DELETE'),
  servers:()=>request<{servers:NativeServer[]}>('mcp/servers'),
  create:(input:ServerInput)=>request('mcp/servers','POST',input),
  test:(name:string)=>request<Probe>(`${server(name)}/test`,'POST',{}),
  enable:(name:string,enabled:boolean)=>request(server(name),'PATCH',{enabled}),
  remove:(name:string)=>request(server(name),'DELETE'),
  signIn:(name:string)=>request<{auth:SignIn}>(`${server(name)}/sign-in`,'POST',{}),
  signInStatus:(name:string,id:string)=>request<{auth:SignIn}>(`${server(name)}/sign-in/${encodeURIComponent(id)}`),
  cancelSignIn:(name:string,id:string)=>request(`${server(name)}/sign-in/${encodeURIComponent(id)}`,'DELETE'),
  completeSignIn:(name:string,id:string,callbackUrl:string)=>request<{auth:SignIn}>(`${server(name)}/sign-in/${encodeURIComponent(id)}`,'POST',{callbackUrl}),
};
