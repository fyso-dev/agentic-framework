import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connectors, type AppCatalog, type ConnectedApps, type AppState } from '../api/connectors';
import { appConnectionState } from '../lib/app-connection-state';
import { href } from '../lib/router';
import { useStore } from '../store';
import { useDaguAction } from '../lib/useDaguAction';
import { base64Utf8 } from '../lib/team';
import { ConnectorLogo } from './ConnectorLogo';

// Account authorization and per-bot grants are separate native OMB contracts.
type Level='off'|'read'|'write';
type Profile={botId:string;revision:string;composio:boolean;connectorScopes:{apps:Record<string,'read'|'write'>}|null;connectorTools:Record<string,{tools:'*'|string[]}>|null};
export function ConnectedApplications({botId}:{botId?:string}) {
  const {t}=useTranslation(),s=useStore();
  const action=useDaguAction<Profile&{planId?:string;applied?:boolean}>(s.backend,'fyso-app-access','RESULT');
  const generation=useRef(0);
  const [profile,setProfile]=useState<Profile>(),[changes,setChanges]=useState<Record<string,Level>>({}),[plan,setPlan]=useState<string>(),[saved,setSaved]=useState(false);
  const busy=action.phase==='running';
  useEffect(()=>{const current=++generation.current;setProfile(undefined);setChanges({});setPlan(undefined);setSaved(false);if(botId&&!s.mock)void action.start({OP:'read',BOT_ID:botId}).then(result=>{if(current===generation.current&&result)setProfile(result);});return()=>{generation.current++;};},[botId,s.mock]);
  function level(slug:string):Level {
    if(!profile||!profile.composio)return 'off';
    if(profile.connectorScopes&&!Object.hasOwn(profile.connectorScopes.apps,slug)||profile.connectorTools&&!Object.hasOwn(profile.connectorTools,slug))return 'off';
    return profile.connectorScopes?.apps[slug]||'write';
  }
  async function preview() {
    if(!profile||!botId)return;const current=generation.current;
    const result=await action.start({OP:'plan',BOT_ID:botId,REVISION:profile.revision,CHANGES_B64:base64Utf8(JSON.stringify(changes))});
    if(current===generation.current&&result?.planId)setPlan(result.planId);
  }
  async function apply() {
    if(!plan||!botId)return;const current=generation.current;
    const result=await action.start({OP:'apply',PLAN_ID:plan});
    if(current!==generation.current||!result)return;
    setPlan(undefined);setChanges({});setSaved(true);
    const fresh=await action.start({OP:'read',BOT_ID:botId});if(current===generation.current&&fresh)setProfile(fresh);
  }
  async function refresh() {
    setRevision(v=>v+1);setPlan(undefined);setChanges({});setSaved(false);
    if(botId){const current=generation.current;setProfile(undefined);const fresh=await action.start({OP:'read',BOT_ID:botId});if(current===generation.current&&fresh)setProfile(fresh);}
  }
  const [data,setData]=useState<{catalog:AppCatalog;accounts:ConnectedApps}>(),[failed,setFailed]=useState(false),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    setLoading(true);setFailed(false);
    if(s.mock){setData({catalog:{configured:false,cards:[],source:'mock'},accounts:{configured:false,services:{}}});setLoading(false);return;}
    void Promise.allSettled([connectors.catalog(),connectors.connected()]).then(([catalog,accounts])=>{
      if(accounts.status==='rejected')throw accounts.reason;
      if(active)setData({catalog:catalog.status==='fulfilled'?catalog.value:{configured:accounts.value.configured,cards:[],source:'unavailable'},accounts:accounts.value});
    }).catch(()=>{if(active){setData(undefined);setFailed(true);}}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[revision,s.mock]);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible')setRevision(v=>v+1);};
    window.addEventListener('focus',refresh);
    return()=>window.removeEventListener('focus',refresh);
  },[]);
  const services=Object.entries({...Object.fromEntries([...Object.keys(profile?.connectorScopes?.apps||{}),...Object.keys(profile?.connectorTools||{})].map(slug=>[slug,{connected:false} as AppState])),...data?.accounts.services}).filter(([slug,state])=>state.connected||state.pending||state.accounts?.length||profile?.connectorScopes?.apps[slug]||profile?.connectorTools?.[slug]);
  return <section className="bot-connected-apps" aria-label={t('botConnectors.appsTitle')}>
    <h3>{t('botConnectors.appsTitle')}</h3>

    {!botId&&<p className="hint">{t('botConnectors.saveBotFirst')}</p>}
    {action.phase==='failed'&&<p role="alert" className="field-err">{t('botConnectors.permissionsFailed')}</p>}
    {saved&&<p role="status" className="hint">{t('botConnectors.permissionsSaved')}</p>}
    {loading&&<p role="status" className="hint">{t('common.loading')}</p>}
    {failed&&<p role="alert" className="field-err">{t('botConnectors.appsFailed')}</p>}
    {data&&!loading&&<>
      {!data.accounts.configured?<p className="hint">{t('connectors.setupRequired')}</p>:<>
        {data.accounts.inventoryComplete===false&&<p role="status" className="hint">{t('connectors.partialAccounts')}</p>}
        {!services.length&&<p className="hint">{t('botConnectors.noApps')}</p>}
        <div className="bot-app-grid">{services.map(([slug,state])=><div className="bot-app-card" key={slug}>
          <div className="grow"><p className="connector-app-title" style={{fontWeight:700}}><ConnectorLogo logo={data.catalog.cards.find(card=>card.slug===slug)?.logo} label={data.catalog.cards.find(card=>card.slug===slug)?.label||slug}/><span>{data.catalog.cards.find(card=>card.slug===slug)?.label||slug}</span></p>
            <p className="hint">{t(`connectors.${appConnectionState(data.catalog,data.accounts,slug)}`)}</p>
          </div>
          <label className="field"><span className="sr-only">{t('botConnectors.appAccess',{name:data.catalog.cards.find(card=>card.slug===slug)?.label||slug})}</span><select className="select" aria-label={t('botConnectors.appAccess',{name:data.catalog.cards.find(card=>card.slug===slug)?.label||slug})} value={profile?changes[slug]||level(slug):'unknown'} disabled={!profile||busy||!!plan||!!s.mock} onChange={event=>{setChanges(previous=>({...previous,[slug]:event.target.value as Level}));setSaved(false);}}><option value="unknown" disabled>{t('connectors.unverifiedShort')}</option><option value="off">{t('botConnectors.level.off')}</option><option value="read" disabled={!state.connected}>{t('botConnectors.level.read')}</option><option value="write" disabled={!state.connected}>{t('botConnectors.level.write')}</option></select>{Array.isArray(profile?.connectorTools?.[slug]?.tools)&&<small className="hint">{t('botConnectors.preserveTools')}</small>}</label>
        </div>)}</div>
      </>}
    </>}
    {Object.keys(changes).length>0&&<div className="connector-preview"><p className="hint">{t(plan?'botConnectors.reviewAppPermissions':'botConnectors.appChangeHint')}</p><ul>{Object.entries(changes).map(([slug,value])=><li key={slug}>{data?.catalog.cards.find(card=>card.slug===slug)?.label||slug}: {t(`botConnectors.level.${value}`)}</li>)}</ul><div className="connector-actions">{plan?<button className="btn btn-pri" type="button" disabled={busy} onClick={()=>void apply()}>{t('botConnectors.applyPermissions')}</button>:<button className="btn btn-pri" type="button" disabled={busy||!profile} onClick={()=>void preview()}>{t('botConnectors.previewPermissions')}</button>}<button className="btn btn-soft" type="button" disabled={busy} onClick={()=>{setPlan(undefined);setChanges({});}}>{t('common.cancel')}</button></div></div>}
    <div className="connector-actions">
      <button className="icon-btn" type="button" disabled={loading||busy} onClick={()=>void refresh()}><span aria-hidden="true">↻</span><span className="sr-only">{t('botConnectors.refreshApps')}</span></button>
      <a className="btn btn-soft" href={href.connectors} target="_blank" rel="noopener noreferrer">{t('botConnectors.manageApps')} ↗</a>
    </div>
    <details className="connector-help"><summary>{t('botConnectors.permissionsHelp')}</summary><p className="hint">{t('botConnectors.appPermissionsHint')}</p></details>
  </section>;
}
