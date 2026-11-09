import {useEffect,useRef} from 'react';
import {useTranslation} from 'react-i18next';

export type AuthorizationPhase='preparing'|'waiting'|'complete'|'failed';
export function ConnectionAuthorization({phase,label,url,opened,checkFailed,pasteBack,callback,busy,onOpened,onCallback,onCheck,onCancel,onDone}:{
  phase?:AuthorizationPhase;label:string;url?:string;opened:boolean;checkFailed:boolean;pasteBack:boolean;callback:string;busy:boolean;
  onOpened:()=>void;onCallback:(value:string)=>void;onCheck:()=>void;onCancel:()=>void;onDone:()=>void;
}) {
  const {t}=useTranslation(),dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(phase&&!dialog.current?.open)dialog.current?.showModal();else if(!phase&&dialog.current?.open)dialog.current?.close();},[phase]);
  return <dialog ref={dialog} className="modal connection-flow" aria-labelledby="connection-authorization-title" onCancel={event=>{event.preventDefault();if(!busy)onCancel();}}>
    <div className="modal-head"><h2 id="connection-authorization-title">{t(phase==='complete'?'connectionFlow.connectedTitle':'connectionFlow.title',{app:label})}</h2></div>
    <div className="modal-body">
      {phase==='preparing'&&<p role="status">{t('connectionFlow.preparing',{app:label})}</p>}
      {phase==='failed'&&<p role="alert">{t('connectionFlow.failed',{app:label})}</p>}
      {phase==='waiting'&&<>
        <ol><li><strong>{t('connectionFlow.openStep',{app:label})}</strong><p>{t('connectionFlow.openHint')}</p>{url&&<a className="btn btn-pri" href={url} target="_blank" rel="noopener noreferrer" onClick={onOpened}>{t('connectionFlow.open',{app:label})} <span aria-hidden="true">↗</span></a>}</li>
          <li><strong>{t('connectionFlow.approveStep')}</strong><p>{t('connectionFlow.approveHint',{app:label})}</p></li>
          <li><strong>{t('connectionFlow.returnStep')}</strong><p>{t('connectionFlow.returnHint')}</p></li></ol>
        {checkFailed&&<p role="alert">{t('connectionFlow.checkFailed')}</p>}
        {opened&&<p role="status">{t(pasteBack?'connectionFlow.callbackPending':'connectionFlow.waiting',{app:label})}</p>}
        {pasteBack&&<label className="field">{t('connectors.callback')}<input className="input" type="password" autoComplete="off" value={callback} onChange={event=>onCallback(event.target.value)}/></label>}
      </>}
      {phase==='complete'&&<p role="status">{t('connectionFlow.complete',{app:label})}</p>}
    </div>
    <div className="modal-foot">
      {phase==='complete'?<button type="button" className="btn btn-pri" disabled={busy} onClick={()=>{dialog.current?.close();onDone();}}>{t('connectionFlow.done')}</button>:<>
        {phase==='waiting'&&<button className="btn btn-ghost" type="button" disabled={busy} onClick={onCheck}>{t('connectionFlow.check')}</button>}
        <button className="btn btn-ghost" type="button" disabled={busy} onClick={onCancel}>{t(phase==='failed'?'connectionFlow.back':'common.cancel')}</button>
      </>}
    </div>
  </dialog>;
}
