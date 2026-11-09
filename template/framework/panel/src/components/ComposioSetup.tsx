import {useState,type FormEvent} from 'react';
import {useTranslation} from 'react-i18next';

export function ComposioSetup({configured,onConfigured}:{configured:boolean;onConfigured:()=>Promise<void>}) {
  const {t}=useTranslation();
  const [open,setOpen]=useState(false),[apiKey,setApiKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  async function submit(event:FormEvent) {
    event.preventDefault();if(busy)return;
    const value=apiKey;setApiKey('');setBusy(true);setMessage('');setFailed(false);
    try {
      const response=await fetch('/api/composio/setup',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey:value})});
      if(response.status===401)window.dispatchEvent(new Event('fyso-session-expired'));
      const result=await response.json();
      if(!response.ok){const known=['invalidInput','invalidKey','providerUnavailable','pendingSecrets','busy','saveFailed'];setMessage(known.includes(result.error)?result.error:'saveFailed');setFailed(true);return;}
      setMessage(result.active?'ready':'activationPending');setOpen(!result.active);await onConfigured();
    }catch{setMessage('saveFailed');setFailed(true);}
    finally{setBusy(false);}
  }
  return <section className={`card connector-card ${configured&&!open?'composio-compact':''}`} aria-labelledby="composio-setup-title">
    <div className="connector-heading"><div><h2 id="composio-setup-title">{t('composioSetup.title')}</h2><p className="mute">{t(configured?'composioSetup.configuredShort':'composioSetup.hint')}</p></div><button type="button" className={`btn ${configured&&!open?'btn-sm btn-ghost':'btn-pri'}`} disabled={busy} onClick={()=>{setOpen(!open);setApiKey('');setMessage('');}}>{t(configured?'composioSetup.change':'composioSetup.configure')}</button></div>
    {configured&&!open&&<button className="btn btn-sm btn-pri" type="button" onClick={()=>{const heading=document.getElementById('connector-apps');heading?.scrollIntoView({block:'start',behavior:'smooth'});heading?.focus({preventScroll:true});}}>{t('composioSetup.chooseApp')}</button>}
    {message&&<p role={failed?'alert':'status'} className={failed?'banner banner-down':'banner'}>{t(`composioSetup.${message}`)}</p>}
    {open&&<form className="form" onSubmit={event=>void submit(event)}>
      <ol><li><strong>{t('composioSetup.obtainKey')}</strong><br/><a href="https://dashboard.composio.dev/~/project/settings/api-keys" target="_blank" rel="noopener noreferrer">{t('composioSetup.dashboard')} <span aria-hidden="true">↗</span></a> {t('composioSetup.keyLocation')}</li><li><strong>{t('composioSetup.returnHere')}</strong><br/>{t('composioSetup.paste')}</li><li><strong>{t('composioSetup.connectApp')}</strong><br/>{t('composioSetup.authorize')}</li></ol>
      <label className="field">{t('composioSetup.key')}<input type="password" className="input" required minLength={8} maxLength={4096} autoComplete="new-password" spellCheck={false} value={apiKey} disabled={busy} onChange={event=>setApiKey(event.target.value)}/></label>
      <p className="mute">{t('composioSetup.private')}</p>
      <div className="connector-actions"><button className="btn btn-pri" type="submit" disabled={busy||!apiKey.trim()}>{t(busy?'composioSetup.saving':'composioSetup.save')}</button><button className="btn btn-soft" type="button" disabled={busy} onClick={()=>{setOpen(false);setApiKey('');}}>{t('common.cancel')}</button></div>
    </form>}
  </section>;
}
