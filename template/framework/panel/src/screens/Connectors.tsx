import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { connectors, directMcp, type AppCatalog, type ConnectedApps, type NativeServer, type Probe, type SignIn, type ServerInput } from '../api/connectors';
import { accessFor, selectServer, type ToolScope } from '../lib/connector-access';
import { appConnectionState, accountConnectionState } from '../lib/app-connection-state';
import { useDaguAction } from '../lib/useDaguAction';
import { base64Utf8 } from '../lib/team';
import { useStore } from '../store';
import { isRecommendedApp, recommendedApps } from '../lib/recommended-connectors';
import { ConnectorLogo } from '../components/ConnectorLogo';
import { ConnectedApplications } from '../components/ConnectedApplications';
import { ComposioSetup } from '../components/ComposioSetup';
import { ConnectionAuthorization,type AuthorizationPhase } from '../components/ConnectionAuthorization';

type Inventory={servers:{name:string;portable:boolean;sources:string[];enabled:boolean|null}[]};
type BotRead={id:string;mcpServers?:string[]|null;bot:{name:string;tools?:ToolScope}};
type Plan={planId:string;preview:{plan:string[]}};
type OAuth={kind:'app';name:string;alias:string;url:string}|{kind:'mcp';name:string;auth:SignIn;url:string};
const safeUrl=(value:string)=>{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('invalid authorization URL');return url.href;};

export function Connectors({initialBotId}:{initialBotId?:string}) {
  const {t}=useTranslation(),s=useStore(),epoch=useRef(0),mounted=useRef(true);
  const inventory=useDaguAction<Inventory>(s.backend,'fyso-bot-architect','RESULT');
  const preferences=useDaguAction<{features:{claudeUserMcp:boolean;claudeUserSkills:boolean};versioned:boolean}>(s.backend,'fyso-connector-preferences','RESULT');
  const operation=useDaguAction<BotRead & Plan & {commit:string}>(s.backend,'fyso-bot-architect','RESULT');
  const [catalog,setCatalog]=useState<AppCatalog>(),[accounts,setAccounts]=useState<ConnectedApps>(),[servers,setServers]=useState<NativeServer[]>();
  const [failures,setFailures]=useState<string[]>([]),[busy,setBusy]=useState(''),[loading,setLoading]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(false);
  const [query,setQuery]=useState(''),[connectedOnly,setConnectedOnly]=useState(false),[limit,setLimit]=useState(24),[alias,setAlias]=useState(''),[namingApp,setNamingApp]=useState(''),[recommendedOnly,setRecommendedOnly]=useState(true);
  const [showForm,setShowForm]=useState(false),[kind,setKind]=useState('http'),[name,setName]=useState(''),[url,setUrl]=useState(''),[command,setCommand]=useState(''),[args,setArgs]=useState(''),[header,setHeader]=useState('Authorization'),[credential,setCredential]=useState('');
  const [probes,setProbes]=useState<Record<string,Probe>>({}),[oauth,setOAuth]=useState<OAuth>(),[callback,setCallback]=useState('');
  const [authPhase,setAuthPhase]=useState<AuthorizationPhase>(),[authLabel,setAuthLabel]=useState(''),[authOpened,setAuthOpened]=useState(false),[authCheckError,setAuthCheckError]=useState(false);
  const authEpoch=useRef(0),authChecking=useRef(false),authCheck=useRef<()=>Promise<void>>(async()=>{}),authTarget=useRef<{kind:'app'|'mcp';name:string}|undefined>(undefined);
  const [removal,setRemoval]=useState<{kind:'mcp'|'account';name:string;id?:string;label:string}>();
  const [botId,setBotId]=useState(''),[profile,setProfile]=useState<BotRead>(),[scope,setScope]=useState<ToolScope>(),[plan,setPlan]=useState<Plan>();
  const accessSection=useRef<HTMLElement>(null);
  useEffect(()=>{if(initialBotId)void readBot(initialBotId);},[initialBotId]);
  useEffect(()=>{if(initialBotId && profile?.id===initialBotId)accessSection.current?.scrollIntoView({block:"start"});},[initialBotId,profile?.id]);
  const readEpoch=useRef(0),confirmation=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(removal && confirmation.current && !confirmation.current.open)confirmation.current.showModal();},[removal]);
  const refresh=useCallback(async()=>{
    const current=++epoch.current;setLoading(true);setFailures([]);setCatalog(undefined);setAccounts(undefined);setServers(undefined);
    const accept=()=>mounted.current && current===epoch.current;
    await Promise.allSettled([
      connectors.catalog().then(data=>{if(accept())setCatalog(data);}).catch(()=>{if(accept())setFailures(v=>[...v,'apps']);}),
      connectors.connected().then(data=>{if(accept())setAccounts(data);}).catch(()=>{if(accept())setFailures(v=>[...v,'accounts']);}),
      connectors.servers().then(data=>{if(accept())setServers(data.servers);}).catch(()=>{if(accept())setFailures(v=>[...v,'mcp']);}),
    ]);
    if(accept())setLoading(false);
  },[]);
  useEffect(()=>{mounted.current=true;void refresh();void inventory.start({OP:'connections'});void preferences.start({OP:'read'});return()=>{mounted.current=false;++epoch.current;++readEpoch.current;};},[refresh]); // Native reads are independent of the slower Dagu inventory.
  const notify=(key:string,failed=false)=>{if(mounted.current){setNotice(key);setError(failed);}};
  async function run(id:string,fn:()=>Promise<void>,reload=true) {
    if(busy)return;setBusy(id);setNotice('');
    try{await fn();if(reload && mounted.current){await refresh();void inventory.start({OP:'connections'});}}
    catch{notify('requestFailed',true);if(reload && mounted.current)await refresh();}
    finally{if(mounted.current)setBusy('');}
  }
  function connectionLabel(name:string) {
    return catalog?.cards.find(card=>card.slug===name)?.label||directMcp.find(preset=>preset.id===name)?.label||name;
  }
  function startAuthorization(id:string,target:{kind:'app'|'mcp';name:string},task:()=>Promise<OAuth>,reload=false) {
    const generation=++authEpoch.current;authTarget.current=target;
    setAuthPhase('preparing');setAuthCheckError(false);setAuthLabel(connectionLabel(target.name));setAuthOpened(false);setOAuth(undefined);setCallback('');
    void run(id,async()=>{try{const flow=await task();if(mounted.current&&generation===authEpoch.current){setOAuth(flow);setAuthPhase('waiting');}}catch(error){if(generation===authEpoch.current)setAuthPhase('failed');throw error;}},reload);
  }
  function beginApp(slug:string,accountAlias='') {
    setNamingApp('');setAlias('');
    startAuthorization(`app:${slug}`,{kind:'app',name:slug},async()=>{const result=await connectors.authorizeApp(slug,accountAlias);return {kind:'app',name:slug,alias:accountAlias,url:safeUrl(result.url)};});
  }
  function beginDirect(preset:typeof directMcp[number]) {
    startAuthorization(`direct:${preset.id}`,{kind:'mcp',name:preset.id},async()=>{
      const existing=servers?.find(server=>server.url?.replace(/\/$/,'')===preset.url.replace(/\/$/,''));
      const name=existing?.name||preset.id;
      if(!existing)await connectors.create({name,type:'http',url:preset.url});
      const {auth}=await connectors.signIn(name);
      if(!auth.authorizationUrl)throw Error('missing authorization URL');
      authTarget.current={kind:'mcp',name};return {kind:'mcp',name,auth,url:safeUrl(auth.authorizationUrl)};
    },true);
  }
  function beginMcp(server:string) {
    startAuthorization(`signin:${server}`,{kind:'mcp',name:server},async()=>{const result=await connectors.signIn(server);if(!result.auth.authorizationUrl)throw Error('missing authorization URL');return {kind:'mcp',name:server,auth:result.auth,url:safeUrl(result.auth.authorizationUrl)};});
  }
  async function verifyAuthorization(silent=false) {
    if(!oauth)return;
    const flow=oauth,generation=authEpoch.current,current=()=>mounted.current&&generation===authEpoch.current;
    async function complete() {if(!current())return;setOAuth(undefined);setAuthPhase('complete');setCallback('');notify('authorized');await refresh();}
    if(flow.kind==='app') {
      const result=await connectors.connected();if(!current())return;
      const state=result.services[flow.name];setAccounts(result);
      const done=flow.alias?state?.accounts?.some(account=>account.alias?.toLowerCase()===flow.alias.toLowerCase() && /^active$/i.test(account.status)):state?.connected;
      if(done)await complete();else if(!silent)notify('authorizationPending');
    }else{
      const value=callback;if(value)setCallback('');
      let result=await connectors.signInStatus(flow.name,flow.auth.flowId);if(!current())return;
      if(value && result.auth.phase==='waiting'){result=await connectors.completeSignIn(flow.name,flow.auth.flowId,value);if(!current())return;}
      if(['succeeded','connected','signed-in','complete'].includes(result.auth.phase)) {
        const probe=await connectors.test(flow.name);if(!current())return;setProbes(v=>({...v,[flow.name]:probe}));
        if(probe.ok){await connectors.enable(flow.name,true);if(current())await complete();}else{setAuthPhase('failed');setOAuth(undefined);notify('testFailed',true);}
      }else if(result.auth.phase==='waiting'){setOAuth({...flow,auth:result.auth});if(!silent)notify('authorizationPending');}
      else {setOAuth(undefined);setAuthPhase('failed');notify('authorizationFailed',true);}
    }
  }
  async function finishAuthorization(silent=false) {
    if(authChecking.current)return;
    authChecking.current=true;
    try{await verifyAuthorization(silent);}finally{authChecking.current=false;}
  }
  authCheck.current=()=>finishAuthorization(true);
  const flowId=oauth?.kind==='mcp'?oauth.auth.flowId:oauth?.name;
  const needsCallback=oauth?.kind==='mcp'&&oauth.auth.pasteBack===true;
  useEffect(()=>{
    if(!oauth||!authOpened||needsCallback||authPhase!=='waiting')return;
    let active=true,checking=false;
    const check=async()=>{if(!active||checking||document.visibilityState==='hidden')return;checking=true;try{await authCheck.current();if(active)setAuthCheckError(false);}catch{if(active&&mounted.current)setAuthCheckError(true);}finally{checking=false;}};
    const interval=window.setInterval(()=>void check(),3000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);void check();
    return()=>{active=false;window.clearInterval(interval);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check);};
  },[flowId,authOpened,needsCallback,authPhase]);
  function cancelAuthorization() {
    const flow=oauth;++authEpoch.current;setOAuth(undefined);setAuthPhase(undefined);setAuthOpened(false);setCallback('');
    if(flow?.kind==='mcp')void run('cancel-oauth',async()=>{await connectors.cancelSignIn(flow.name,flow.auth.flowId);});
  }
  function closeAuthorization() {
    const target=authTarget.current;++authEpoch.current;setAuthPhase(undefined);setAuthOpened(false);setCallback('');
    const card=target&&document.getElementById(`connector-${target.kind}-${target.name}`);
    const destination=card||document.getElementById('connector-apps');destination?.scrollIntoView({block:'center',behavior:'smooth'});destination?.focus({preventScroll:true});
  }
  async function testServer(server:string) {
    const probe=await connectors.test(server);setProbes(v=>({...v,[server]:probe}));
    notify(probe.ok?'testPassed':probe.auth==='required'?'signInRequired':'testFailed',!probe.ok);
  }
  async function addServer(event:FormEvent) {
    event.preventDefault();
    if(!/^[a-z][a-z0-9_-]{0,31}$/.test(name)){notify('invalidName',true);return;}
    const entry:ServerInput={name};
    if(kind==='command') {if(!command.trim()){notify('invalidCommand',true);return;}entry.command=command.trim();entry.args=args.split('\n').filter(Boolean);}
    else {
      try{const parsed=new URL(url);safeUrl(url);if([...parsed.searchParams.keys()].some(key=>/token|key|secret|password|authorization/i.test(key)))throw Error('credential in address');}catch{notify('invalidUrl',true);return;}
      entry.type=kind as 'http'|'sse';entry.url=url.trim();
      if(credential){if(!/^[A-Za-z0-9-]{1,128}$/.test(header)||/[\r\n]/.test(credential)){notify('invalidHeader',true);return;}entry.headers={[header]:credential};}
    }
    setCredential('');
    await run('create',async()=>{
      await connectors.create(entry);setShowForm(false);setName('');setUrl('');setCommand('');setArgs('');
      try {
        const probe=await connectors.test(entry.name);setProbes(v=>({...v,[entry.name]:probe}));
        if(probe.ok)await connectors.enable(entry.name,true);
        notify(probe.ok?'created':probe.auth==='required'?'createdSignIn':'createdOff',!probe.ok && probe.auth!=='required');
      } catch {notify('createdOff',true);}
    });
  }
  async function readBot(id:string) {
    const current=++readEpoch.current;setBotId(id);setProfile(undefined);setScope(undefined);setPlan(undefined);setNotice('');
    if(!id)return;
    const result=await operation.start({OP:'read',BOT_ID:id});
    if(mounted.current && current===readEpoch.current && result){setProfile(result);setScope(result.bot.tools);}
  }
  const declared=inventory.phase==='ok'?inventory.output?.servers:undefined;
  const serverNames=[...new Set([...(declared||[]).map(server=>server.name),...(servers||[]).map(server=>server.name)])].sort();
  const blocked=(name:string)=>{const native=servers?.find(server=>server.name===name);return !!native && (!!native.bot && native.bot!==botId || !!native.offFor?.includes(botId) || !!profile?.mcpServers && !profile.mcpServers.includes(name));};
  const appCards=catalog?.cards.filter(card=>(!recommendedOnly||!!query.trim()||isRecommendedApp(card.slug)||accounts?.services[card.slug]?.connected||!!accounts?.services[card.slug]?.accounts?.length)&&(!connectedOnly || accounts?.services[card.slug]?.connected) && `${card.label} ${card.slug}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{const rank=(slug:string)=>{const index=(recommendedApps as readonly string[]).indexOf(slug);return index<0?recommendedApps.length:index;};return rank(a.slug)-rank(b.slug);})||[];
  const workflowBusy=operation.phase==='running'||preferences.phase==='running',disabled=!!busy||workflowBusy;
  return <main className="page page-wide connectors-page">
    <div className="page-head"><div><h1>{t('connectors.title')}</h1><p>{t('connectors.subtitle')}</p></div><button className="btn btn-ghost" type="button" disabled={disabled||loading} onClick={()=>{void refresh();void inventory.start({OP:'connections'});void preferences.start({OP:'read'});}}>{t(loading?'connectors.loading':'connectors.refresh')}</button></div>
    {notice && <p role={error?'alert':'status'} className={`banner ${error?'banner-down':''}`}>{t(`connectors.${notice}`)}</p>}
    {failures.map(failure=><p role="alert" className="banner banner-down" key={failure}>{t(`connectors.failed.${failure}`)}</p>)}
    <ConnectionAuthorization phase={authPhase} label={authLabel} url={oauth?.url} opened={authOpened} checkFailed={authCheckError} pasteBack={!!needsCallback} callback={callback} busy={!!busy||(authPhase==='complete'&&loading)} onOpened={()=>setAuthOpened(true)} onCallback={setCallback} onCheck={()=>void run('oauth',async()=>{try{await finishAuthorization();setAuthCheckError(false);}catch(error){setAuthPhase('failed');throw error;}},false)} onCancel={cancelAuthorization} onDone={closeAuthorization}/>
    <ComposioSetup configured={catalog?.configured===true} onConfigured={refresh}/>
    <section aria-labelledby="connector-apps"><div className="connector-heading"><h2 id="connector-apps" tabIndex={-1}>{t('connectors.apps')}</h2></div>
      {catalog && !catalog.configured && <p className="banner">{t('connectors.setupRequired')}</p>}
      {catalog?.pagination?.complete===false && <p role="status">{t('connectors.partialCatalog')}</p>}
      {accounts?.inventoryComplete===false && <p role="status">{t('connectors.partialAccounts')}</p>}
      <div className="connector-filters"><div className="connector-segment"><button className="btn btn-ghost" type="button" aria-pressed={recommendedOnly} onClick={()=>{setRecommendedOnly(true);setLimit(24);}}>{t('connectors.recommended')}</button><button className="btn btn-ghost" type="button" aria-pressed={!recommendedOnly} onClick={()=>{setRecommendedOnly(false);setLimit(24);}}>{t('connectors.allApps')}</button></div><label className="field">{t('connectors.search')}<input className="input" type="search" value={query} onChange={event=>{setQuery(event.target.value);setLimit(24);}}/></label><label><input type="checkbox" checked={connectedOnly} onChange={event=>setConnectedOnly(event.target.checked)}/> {t('connectors.connectedOnly')}</label></div>
      <div className="connector-grid connector-app-grid">{appCards.slice(0,limit).map(card=><article className="card connector-card" key={card.slug} id={`connector-app-${card.slug}`} tabIndex={-1}><div className="connector-heading"><div className="connector-app-title"><ConnectorLogo logo={card.logo} label={card.label}/><h3>{card.label}</h3></div><span className={`pill ${accounts?.services[card.slug]?.connected?'pill-ok':accounts?.services[card.slug]?.accounts?.length?'pill-warn':'pill-unk'}`}>{t(`connectors.${appConnectionState(catalog,accounts,card.slug)}`)}</span></div>
        <button className="btn btn-ghost" type="button" disabled={disabled||!!oauth||!catalog?.configured||!accounts} onClick={()=>{if(accounts?.services[card.slug]?.connected){setNamingApp(card.slug);setAlias('');}else beginApp(card.slug);}}>{t(accounts?.services[card.slug]?.connected?'connectors.addAccount':'connectors.connect')}</button>
        {namingApp===card.slug&&<form onSubmit={event=>{event.preventDefault();if(alias.trim())beginApp(card.slug,alias.trim());}}><label className="field">{t('connectors.nameAccount',{name:card.label})}<input className="input" autoFocus required value={alias} onChange={event=>setAlias(event.target.value)} placeholder={t('connectors.aliasPlaceholder')}/></label><div className="connector-actions"><button className="btn btn-pri" type="submit" disabled={disabled||!alias.trim()}>{t('connectors.startAuthorization')}</button><button className="btn btn-ghost" type="button" onClick={()=>setNamingApp('')}>{t('common.cancel')}</button></div></form>}
        {!!accounts?.services[card.slug]?.accounts?.length&&<details className="connector-accounts"><summary>{t('botConnectors.accountCount',{count:accounts.services[card.slug].accounts!.length})}</summary>{accounts?.services[card.slug]?.accounts?.map((account,index)=><div className="connector-account" key={account.id}><span>{account.alias||t('connectors.accountNumber',{number:index+1})}<br/><small className="mute">{t(`connectors.${accountConnectionState(account.status)}`)}</small></span><button className="btn btn-ghost" type="button" disabled={disabled} onClick={()=>setRemoval({kind:'account',name:card.slug,id:account.id,label:`${card.label} · ${account.alias||t('connectors.accountNumber',{number:index+1})}`})}>{t(accountConnectionState(account.status)==='accountActive'?'connectors.disconnect':'connectors.removeConnection')}</button></div>)}</details>}
      </article>)}</div>
      {catalog && !appCards.length && <p>{t('connectors.noApps')}</p>}
      {appCards.length>limit && <button className="btn btn-ghost" type="button" onClick={()=>setLimit(v=>v+24)}>{t('connectors.more')}</button>}
    </section>
    <details className="connector-advanced"><summary>{t('connectors.advancedSources')}</summary>    <section aria-labelledby="connector-direct"><h2 id="connector-direct">{t('connectors.directTitle')}</h2><p className="mute">{t('connectors.directHint')}</p><div className="connector-grid">{directMcp.map(preset=><article className="card connector-card" key={preset.id}><h3>{preset.label}</h3><p className="mute">{t(`connectors.direct.${preset.id}`)}</p><button className="btn btn-ghost" type="button" disabled={disabled||!!oauth||!servers} onClick={()=>beginDirect(preset)}>{t('connectors.connect')}</button></article>)}</div></section>
    <section className="card connector-card" aria-labelledby="connector-claude"><h2 id="connector-claude">{t('connectors.claudeTitle')}</h2><p className="mute">{t('connectors.claudeHint')}</p>
      {preferences.phase==='failed' && <p role="alert">{t('connectors.preferencesFailed')}</p>}
      {(preferences.phase==='ok'||preferences.phase==='running') && preferences.output && <>{(['claudeUserMcp','claudeUserSkills'] as const).map(feature=><label className="connector-account" key={feature}><input type="checkbox" role="switch" aria-label={t(`connectors.${feature}`)} checked={preferences.output!.features[feature]} disabled={disabled} onChange={event=>void preferences.start({OP:'save',SETTINGS_B64:base64Utf8(JSON.stringify({[feature]:event.target.checked}))})}/><span><strong>{t(`connectors.${feature}`)}</strong><br/><span className="mute">{t(`connectors.${feature}Hint`)}</span></span></label>)}</>}
    </section>
    </details>
    <section aria-labelledby="connector-mcp"><div className="connector-heading"><div><h2 id="connector-mcp">{t('connectors.mcp')}</h2><p className="mute">{t('connectors.mcpHint')}</p></div><button className="btn btn-pri" type="button" disabled={disabled} onClick={()=>{setShowForm(!showForm);setCredential('');}}>{t('connectors.addMcp')}</button></div>
      {showForm && <form className="form card" onSubmit={event=>void addServer(event)}><div className="form-grid"><label className="field">{t('connectors.name')}<input className="input" required value={name} maxLength={32} onChange={event=>setName(event.target.value)}/></label><label className="field">{t('connectors.transport')}<select aria-label={t('connectors.transport')} className="select" value={kind} onChange={event=>{setKind(event.target.value);setCredential('');}}><option value="http">{t('connectors.http')}</option><option value="sse">{t('connectors.sse')}</option><option value="command">{t('connectors.command')}</option></select></label></div>
        {kind==='command'?<><label className="field">{t('connectors.executable')}<input className="input" required value={command} onChange={event=>setCommand(event.target.value)}/></label><label className="field">{t('connectors.arguments')}<textarea className="input" rows={3} value={args} onChange={event=>setArgs(event.target.value)}/></label></>:<><label className="field">{t('connectors.url')}<input className="input" type="url" required value={url} onChange={event=>setUrl(event.target.value)}/></label><div className="form-grid"><label className="field">{t('connectors.header')}<input className="input" value={header} onChange={event=>setHeader(event.target.value)}/></label><label className="field">{t('connectors.credential')}<input className="input" type="password" autoComplete="new-password" value={credential} onChange={event=>setCredential(event.target.value)} placeholder={t('connectors.credentialPlaceholder')}/></label></div></>}
        <p className="mute">{t('connectors.secretHint')}</p><div className="connector-actions"><button className="btn btn-pri" disabled={disabled} type="submit">{t('connectors.saveTest')}</button><button className="btn btn-ghost" type="button" disabled={disabled} onClick={()=>{setShowForm(false);setCredential('');}}>{t('common.cancel')}</button></div>
      </form>}
      <div className="connector-grid">{servers?.map(server=><article className="card connector-card" key={server.name} id={`connector-mcp-${server.name}`} tabIndex={-1}><div className="connector-heading"><h3>{server.name}</h3><span className="pill pill-unk">{t(server.enabled?'connectors.enabled':'connectors.disabled')}</span></div><p className="mute">{t('connectors.nativePersistence')}</p>
        {probes[server.name] && <p role="status">{t(probes[server.name].ok?'connectors.toolCount':probes[server.name].auth==='required'?'connectors.signInRequired':'connectors.testFailed',{count:probes[server.name].tools?.length||0})}</p>}
        {probes[server.name]?.ok && <ul className="connector-tool-list">{probes[server.name].tools?.map(tool=><li key={tool.name}>{tool.name}</li>)}</ul>}
        <div className="connector-actions"><button className="btn btn-ghost" type="button" disabled={disabled} onClick={()=>void run(`test:${server.name}`,()=>testServer(server.name))}>{t('connectors.test')}</button>
          {server.type && <button className="btn btn-ghost" type="button" disabled={disabled||!!oauth} onClick={()=>beginMcp(server.name)}>{t('connectors.signIn')}</button>}
          <button className="btn btn-ghost" type="button" disabled={disabled} onClick={()=>void run(`enable:${server.name}`,async()=>{if(!server.enabled){const probe=await connectors.test(server.name);setProbes(v=>({...v,[server.name]:probe}));if(!probe.ok){notify(probe.auth==='required'?'signInRequired':'testFailed',true);return;}}await connectors.enable(server.name,!server.enabled);notify('saved');})}>{t(server.enabled?'connectors.disable':'connectors.enable')}</button>
          <button className="btn btn-ghost" type="button" disabled={disabled} onClick={()=>setRemoval({kind:'mcp',name:server.name,label:server.name})}>{t('connectors.remove')}</button></div>
      </article>)}</div>
      {servers?.length===0 && <p>{t('connectors.noMcp')}</p>}
      {!!declared?.filter(server=>!servers?.some(native=>native.name===server.name)).length && <div className="card connector-card"><h3>{t('connectors.projectServers')}</h3><p className="mute">{t('connectors.projectServersHint')}</p><p>{declared.filter(server=>!servers?.some(native=>native.name===server.name)).map(server=>server.name).join(' · ')}</p></div>}
    </section>
    <section ref={accessSection} className="card connector-card" aria-labelledby="connector-bots"><h2 id="connector-bots">{t('connectors.botAccess')}</h2><p className="mute">{t('connectors.botAccessHint')}</p>
      <label className="field">{t('connectors.bot')}<select aria-label={t('connectors.bot')} className="select" value={botId} disabled={disabled} onChange={event=>void readBot(event.target.value)}><option value="">{t('connectors.chooseBot')}</option>{s.runtimeBots.data?.map(bot=><option key={bot.id} value={bot.id} disabled={bot.name.trim().toLowerCase()==='bot architect'}>{bot.name}</option>)}</select></label>
      {operation.phase==='failed' && <p role="alert">{t('connectors.botFailed')}</p>}
      {s.draft && <p role="status" className="hint">{t('botConnectors.pendingDraft')}</p>}
      {profile && <><ConnectedApplications botId={profile.id}/><h3>{t('botConnectors.mcpTitle')}</h3><div className="connector-permissions">{serverNames.map(server=><label key={server}><input type="checkbox" disabled={disabled||!!s.draft||!servers||blocked(server)} checked={!blocked(server)&&accessFor(scope,server)==='all'} onChange={event=>{setScope(selectServer(scope,server,event.target.checked));setPlan(undefined);}}/> {server} {blocked(server) && <span className="mute">· {t('connectors.nativeBlocked')}</span>} {!blocked(server) && accessFor(scope,server)==='some' && <span className="mute">· {t('connectors.partialAccess')}</span>}</label>)}</div>
        {!plan && <button className="btn btn-ghost" type="button" disabled={disabled||!!s.draft||!servers||!serverNames.length} onClick={()=>void run('plan',async()=>{const next=await operation.start({OP:'plan',ACTION:'update',BOT_ID:botId,BOT_B64:base64Utf8(JSON.stringify({tools:scope||{}}))});if(next)setPlan(next);},false)}>{t('connectors.preview')}</button>}
        {plan && <div className="connector-preview"><h3>{t('connectors.previewTitle')}</h3><ul>{plan.preview.plan?.map((line,index)=><li key={index}>{line}</li>)}</ul><div className="connector-actions"><button className="btn btn-pri" type="button" disabled={disabled||!!s.draft} onClick={()=>void run('apply',async()=>{const result=await operation.start({OP:'apply',PLAN_ID:plan.planId});if(!result)return;setPlan(undefined);await readBot(botId);notify('accessSaved');},false)}>{t('connectors.apply')}</button><button className="btn btn-ghost" type="button" disabled={disabled} onClick={()=>setPlan(undefined)}>{t('common.cancel')}</button></div></div>}
      </>}
    </section>
    {removal && <dialog ref={confirmation} className="connector-dialog" aria-labelledby="remove-connector" onCancel={()=>setRemoval(undefined)}><div className="card connector-card"><h2 id="remove-connector">{t('connectors.removeTitle',{name:removal.label})}</h2><p>{t('connectors.removeHint')}</p><div className="connector-actions"><button className="btn btn-pri" type="button" disabled={disabled} onClick={()=>void run('remove',async()=>{if(removal.kind==='mcp'){await connectors.remove(removal.name);setProbes(v=>{const next={...v};delete next[removal.name];return next;});}else await connectors.removeAccount(removal.name,removal.id!);setRemoval(undefined);setPlan(undefined);notify('removed');})}>{t('connectors.confirmRemove')}</button><button className="btn btn-ghost" type="button" disabled={disabled} autoFocus onClick={()=>setRemoval(undefined)}>{t('common.cancel')}</button></div></div></dialog>}
  </main>;
}
