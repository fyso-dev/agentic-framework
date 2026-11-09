import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connectors, directMcp, type NativeServer } from '../api/connectors';
import type { RuntimeBot } from '../api/types';
import { accessFor, selectServer, type ToolScope } from '../lib/connector-access';
import { href } from '../lib/router';
import { useDaguAction } from '../lib/useDaguAction';
import { useStore } from '../store';
import { ConnectorLogo } from './ConnectorLogo';
import { Switch } from './ui';
import { ConnectedApplications } from './ConnectedApplications';

type ConnectorRow={name:string;label:string;status:string;available:boolean;server?:NativeServer};
type Inventory={servers:{name:string;portable:boolean;enabled:boolean|null;sources:string[]}[]};
export function BotConnectors({scope,onChange,runtime,engine,projectTools}:{scope:ToolScope|undefined;onChange:(scope:ToolScope)=>void;runtime?:RuntimeBot;engine:string;projectTools:boolean}) {
  const {t}=useTranslation(),s=useStore();
  const inventory=useDaguAction<Inventory>(s.backend,'fyso-bot-architect','RESULT');
  const preferences=useDaguAction<{features:{claudeUserMcp:boolean;claudeUserSkills:boolean}}>(s.backend,'fyso-connector-preferences','RESULT');
  const [native,setNative]=useState<NativeServer[]>(),[failed,setFailed]=useState(false),[request,setRequest]=useState(0);
  useEffect(()=>{
    if(s.mock){setNative([]);return;}
    let active=true;setNative(undefined);setFailed(false);
    void connectors.servers().then(result=>{if(active)setNative(result.servers);}).catch(()=>{if(active)setFailed(true);});
    if(!s.mock){void inventory.start({OP:'connections'});void preferences.start({OP:'read'});}
    return()=>{active=false;};
  },[request]);
  const rows=new Map<string,ConnectorRow>();
  for(const server of native||[])rows.set(server.name,{name:server.name,label:server.name,status:server.enabled?'enabled':'disabled',available:server.enabled,server});
  if(inventory.phase==='ok')for(const server of inventory.output?.servers||[]) {
    const prior=rows.get(server.name);
    if(server.portable)rows.set(server.name,{...prior,name:server.name,label:server.name,status:projectTools?'project':'needsProject',available:projectTools});
  }
  for(const preset of directMcp) {
    const existing=native?.find(server=>server.url?.replace(/\/$/,'')===preset.url.replace(/\/$/,''));
    if(existing){const row=rows.get(existing.name);if(row)row.label=preset.label;}

  }
  for(const selector of [...scope?.allow||[],...scope?.deny||[]]) {
    const name=/^mcp:([^:]+):/.exec(selector)?.[1];
    if(name && !rows.has(name))rows.set(name,{name,label:name,status:'unavailable',available:false});
  }
  const loading=inventory.phase==='running'||!native&&!failed;
  const source=preferences.phase==='ok'?preferences.output?.features:undefined;
  const optional=(row:ConnectorRow)=>['whop','agentcard'].includes(row.name)||directMcp.some(preset=>row.server?.url?.replace(/\/$/,'')===preset.url.replace(/\/$/,''));
  const renderRow=(row:ConnectorRow)=>{
      const server=row.server;
      const blocked=!!server && (!!server.bot&&server.bot!==runtime?.id || !!runtime?.id&&!!server.offFor?.includes(runtime.id) || !!runtime?.mcpServers&&!runtime.mcpServers.includes(row.name));
      const access=accessFor(scope,row.name),available=row.available&&!blocked;
      return <div className="bot-mcp-card" key={row.name}><div className="grow"><p className="connector-app-title" style={{fontWeight:600}}><ConnectorLogo label={row.label}/><span>{row.label}</span></p><p className="hint">{t(`botConnectors.status.${blocked?'blocked':row.status}`)}{available&&access==='some'?` · ${t('connectors.partialAccess')}`:''}</p></div><Switch label={t('botConnectors.allow',{name:row.label})} checked={available&&access!=='none'} disabled={loading||!native||!available} onChange={enabled=>onChange(selectServer(scope,row.name,enabled))}/></div>;
    };
  return <fieldset className="form-sec" id="bot-connectors" tabIndex={-1}><legend>{t('botConnectors.title')}</legend><ConnectedApplications botId={runtime?.id}/><h3>{t('botConnectors.mcpTitle')}</h3>
    {(failed || inventory.phase==='failed') && <p role="alert" className="field-err">{t('botConnectors.failed')}</p>}
    {loading && <p role="status" className="hint">{t('common.loading')}</p>}
    <div className="bot-mcp-grid">{[...rows.values()].filter(row=>!optional(row)).sort((a,b)=>a.label.localeCompare(b.label)).map(renderRow)}</div>
    <div className="connector-actions"><button className="btn btn-ghost" type="button" disabled={loading} onClick={()=>setRequest(v=>v+1)}><span aria-hidden="true">↻</span><span className="sr-only">{t('connectors.refresh')}</span></button><a className="btn btn-ghost" href={href.connectors} target="_blank" rel="noopener noreferrer">{t('botConnectors.manage')} ↗</a></div>
    <p className="hint">{t('botConnectors.draftHint')}</p>
    <details className="connector-help"><summary>{t('connectors.advancedSources')}</summary><div className="bot-mcp-grid">{[...rows.values()].filter(optional).map(renderRow)}</div><p className="hint">{t('botConnectors.hint')}</p>{engine==='claude'?<p className="hint">{t('botConnectors.claudeSources',{mcp:t(source?source.claudeUserMcp?'connectors.enabled':'connectors.disabled':'connectors.unknownState'),skills:t(source?source.claudeUserSkills?'connectors.enabled':'connectors.disabled':'connectors.unknownState')})}</p>:<p className="hint">{t(engine==='codex'?'botConnectors.codexSources':'botConnectors.otherSources')}</p>}
    </details>
  </fieldset>;
}
