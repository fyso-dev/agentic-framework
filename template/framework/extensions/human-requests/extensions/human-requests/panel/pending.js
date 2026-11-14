// The SDK supplies rendering, language and theme. Its Dagu client does not expose
// human tasks, so use the existing same-origin gateway for these native endpoints.
const {mountExtensionPage, createElement: h, useState, useRef, useEffect, useTranslation, useStore} = await import('/assets/extension-sdk.js');
const messages = Object.fromEntries(await Promise.all(['es', 'en'].map(async lang => [lang, await (await fetch(`./locales/${lang}.json`)).json()])));
const enc = encodeURIComponent;
async function api(path, init = {}) {
  const response = await fetch(`/api/dagu/${path}`, {credentials: 'same-origin', cache: 'no-store', ...init});
  if (response.status === 401) window.dispatchEvent(new Event('fyso-session-expired'));
  if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.status = response.status; throw error; }
  return response.json();
}
async function listRequests() {
  const results = [];
  let cursor = '';
  const seen = new Set();
  do {
    const query = new URLSearchParams({status: '7', labels: 'human-request', limit: '100'});
    if (cursor) query.set('cursor', cursor);
    const page = await api(`dag-runs?${query}`);
    if (!Array.isArray(page.dagRuns)) throw new Error('Invalid response');
    results.push(...page.dagRuns);
    cursor = page.nextCursor || '';
    if (cursor && seen.has(cursor)) throw new Error('Repeated cursor');
    seen.add(cursor);
  } while (cursor);
  return results;
}
// Keep the recent activity bounded. Details are fetched only when opened.
async function listHistory() {
  const results = [], seen = new Set();
  let cursor = '', pages = 0, omitted = false;
  do {
    const query = new URLSearchParams({labels: 'human-request', limit: '50'});
    if (cursor) query.set('cursor', cursor);
    const page = await api(`dag-runs?${query}`);
    if (!Array.isArray(page.dagRuns)) throw new Error('Invalid response');
    for (const [index, run] of page.dagRuns.entries()) {
      const status = String(run.statusLabel || '').toLowerCase().replace(/[ _-]/g, '');
      if (['queued', 'running', 'succeeded', 'failed', 'rejected', 'aborted', 'cancelled'].includes(status)) results.push(run);
      if (results.length >= 20) {omitted = index < page.dagRuns.length - 1; break;}
    }
    cursor = page.nextCursor || '';
    if (cursor && seen.has(cursor)) throw new Error('Repeated cursor');
    seen.add(cursor);
  } while (cursor && ++pages < 5 && results.length < 20);
  return {runs: results, truncated: Boolean(cursor) || omitted};
}
// Ignore stale history responses when a newer refresh has already started.
async function latestHistory(ref, isActive, onSuccess, onFailure) {
  const generation = ++ref.current;
  try {
    const data = await listHistory();
    if (!isActive() || generation !== ref.current) return null;
    onSuccess(data);
    return data;
  } catch {
    if (isActive() && generation === ref.current) onFailure();
    return null;
  }
}
const labelsOf = run => Array.isArray(run.labels) ? run.labels : [];
const assignee = run => labelsOf(run).find(label => label.startsWith('assignee='))?.slice(9) || 'team';
function readableDate(value, language) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(String(language || '').toLowerCase().startsWith('en') ? 'en' : 'es', {dateStyle:'medium',timeStyle:'short'}).format(date);
}
// A successful delivery step is not proof that an agent completed its work.
function deliveryState(data) {
  const nodes = data?.dagRunDetails?.nodes;
  if (!Array.isArray(nodes)) return 'unknown';
  const node = nodes.find(item => (item.step?.id || item.step?.name) === 'deliver');
  const status = String(node?.statusLabel || '').toLowerCase().replace(/[ _-]/g, '');
  if (status === 'succeeded' || status === 'success') return 'processed';
  if (['failed', 'rejected', 'aborted', 'cancelled'].includes(status)) {
    const error = String(node?.error || '');
    if (error.includes('Invalid request answer') || error.includes('Invalid request choices')) return 'invalid';
    return 'failed';
  }
  return node ? 'pending' : 'unknown';
}
// Listing history can contain 20 records: limit concurrent detail requests,
// and discard queued requests when the user refreshes or leaves the page.
let detailSlots = 4;
const detailWaiters = [];
async function historyDetail(run, signal) {
  if (signal?.aborted) throw Error('Request cancelled');
  if (detailSlots) detailSlots--;
  else await new Promise((resolve, reject) => {
    const next = () => { signal?.removeEventListener('abort', cancel); resolve(); };
    const cancel = () => { const index=detailWaiters.indexOf(next); if (index !== -1) detailWaiters.splice(index,1); reject(Error('Request cancelled')); };
    detailWaiters.push(next);
    signal?.addEventListener('abort', cancel, {once:true});
  });
  try { return await api(`dag-runs/${enc(run.name)}/${enc(run.dagRunId)}`, {signal}); }
  finally { const next = detailWaiters.shift(); if (next) next(); else detailSlots++; }
}
function Field({name, spec, required, value, change, prefix, requestWorkflow}) {
  const {t} = useTranslation();
  const title = ['answer', 'comment', 'responder', 'decision'].includes(name) ? t(`pending.${name}`) : (spec.title || name);
  const rawOptions = spec.enum || (Array.isArray(spec.oneOf) ? spec.oneOf.map(o => o.const) : null);
  const options = requestWorkflow && name === 'decision' && rawOptions ? rawOptions.filter(value => value !== 'expired') : rawOptions;
  const props = {id: `field-${prefix}-${name}`, name, required, value: value ?? '', onChange: event => change(name, spec.type === 'boolean' && event.target.value !== '' ? event.target.value === 'true' : ['number', 'integer'].includes(spec.type) && event.target.value !== '' ? Number(event.target.value) : event.target.value)};
  let control;
  if (options || spec.type === 'boolean') {
    const choices = options || [true, false];
    control = h('select', props, h('option', {value: ''}, t('pending.choose')), ...choices.map(option => h('option', {key: String(option), value: String(option)}, name === 'decision' && ['answered','cancelled'].includes(option) ? t(`pending.${option}`) : String(option))));
  } else if (spec.type === 'string' && name === 'responder') control = h('input', {...props, type: 'text', autoComplete: 'name', maxLength: spec.maxLength});
  else if (spec.type === 'string') control = h('textarea', {...props, rows: name === 'comment' ? 2 : 3, minLength: spec.minLength, maxLength: spec.maxLength, pattern: spec.pattern});
  else control = h('input', {...props, type: 'number', step: spec.type === 'integer' ? '1' : 'any', min: spec.minimum, max: spec.maximum});
  return h('label', {className: 'pending-field', htmlFor: props.id}, h('span', null, title, required ? ` (${t('pending.required')})` : ''), spec.description && h('small', null, spec.description), control);
}
function Request({run, onDone}) {
  const {t} = useTranslation();
  const [detail, setDetail] = useState(null), [values, setValues] = useState({}), [error, setError] = useState(''), [busy, setBusy] = useState(false), [saved, setSaved] = useState(''), [delivery, setDelivery] = useState(''), [resumePending, setResumePending] = useState(false);
  useEffect(() => { let active = true; api(`dag-runs/${enc(run.name)}/${enc(run.dagRunId)}`).then(data => {
    if (!active) return;
    const pending = data.dagRunDetails?.humanTaskResumePending === true;
    const node = data.dagRunDetails?.nodes?.find(n => n.step?.humanTask && ((n.statusLabel || '').toLowerCase() === 'waiting' || (pending && (n.statusLabel || '').toLowerCase() === 'succeeded')));
    if (pending && node) { setResumePending(true); setSaved('resumePending'); }
    if (!node) throw new Error('No waiting human task');
    const form = node.step.humanTask.form || {properties: {}};
    const initial = Object.fromEntries(Object.entries(form.properties || {}).filter(([, spec]) => spec.default !== undefined).map(([key, spec]) => [key, spec.default]));
    setValues(initial); setDetail({node, form});
  }).catch(() => active && setError('detailError')); return () => {active = false;}; }, [run.name, run.dagRunId]);
  useEffect(() => {
    if (!['saved', 'cancelledSaved'].includes(saved) || run.name !== 'ext-human-requests-request') return;
    let active = true, timer, attempts = 0;
    const check = async () => {
      try {
        const status = deliveryState(await api(`dag-runs/${enc(run.name)}/${enc(run.dagRunId)}`));
        if (!active) return;
        setDelivery(status);
        if (status === 'pending' && ++attempts < 20) timer = setTimeout(check, 3000);
      } catch { if (active) setDelivery('unknown'); }
    };
    check();
    return () => {active = false; clearTimeout(timer);};
  }, [saved, run.name, run.dagRunId]);
  const submit = async (event, decision = 'answered') => {
    event?.preventDefault(); if (busy) return;
    if (run.name === 'ext-human-requests-request' && !String(values.responder || '').trim()) { setError('responderRequired'); return; }
    if (run.name === 'ext-human-requests-request' && decision === 'answered' && !String(values.answer || '').trim()) { setError('answerRequired'); return; }
    setBusy(true); setError('');
    try {
      const submitted = run.name === 'ext-human-requests-request' ? {...values, decision, ...(decision === 'cancelled' ? {answer: ''} : {})} : values;
      const input = Object.fromEntries(Object.entries(submitted).filter(([, value]) => value !== ''));
      await api(`dag-runs/${enc(run.name)}/${enc(run.dagRunId)}/human-tasks/${enc(detail.node.step.id || detail.node.step.name)}/complete`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)});
      setSaved(decision === 'cancelled' ? 'cancelledSaved' : 'saved'); onDone();
    } catch (e) {
      if (e.status === 503) {
        setSaved('savedResumeFailed'); onDone();
        try {
          const current = await api(`dag-runs/${enc(run.name)}/${enc(run.dagRunId)}`);
          if (current?.dagRunDetails?.humanTaskResumePending === true) { setResumePending(true); setSaved('resumePending'); }
        } catch { /* An intermediary failure leaves the outcome unknown. */ }
      } else setError('sendError');
    }
    finally {setBusy(false);}
  };
  const resume = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await api(`dag-runs/${enc(run.name)}/${enc(run.dagRunId)}/human-tasks/resume`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'});
      setResumePending(false); setSaved('resumeQueued'); onDone();
    } catch { setError('resumeError'); }
    finally { setBusy(false); }
  };
  const props = {...(detail?.form.properties || {})};
  if (run.name === 'ext-human-requests-request' && props.answer) {
    const encodedLabels = labelsOf(run).filter(label => label.startsWith('choices-hex='));
    if (encodedLabels.length) {
      try {
        if (encodedLabels.length !== 1) throw new Error('Invalid choices');
        const encoded = encodedLabels[0].slice('choices-hex='.length);
        if (!/^(?:[0-9a-f]{2})+$/i.test(encoded)) throw new Error('Invalid choices');
        const bytes = Uint8Array.from(encoded.match(/../g), byte => parseInt(byte, 16));
        const choices = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
        if (!Array.isArray(choices) || !choices.every(choice => typeof choice === 'string' && choice.trim())) throw new Error('Invalid choices');
        if (choices.length) props.answer = {...props.answer, enum: choices};
      } catch { props.answer = {...props.answer, type: 'unsupported'}; }
    }
  }
  const unsupported = Object.values(props).some(spec => !['string','boolean','number','integer'].includes(spec.type));
  const isRequest = run.name === 'ext-human-requests-request';
  const recipient = assignee(run) === 'team' ? t('pending.team') : assignee(run);
  const displayFields = Object.entries(props).filter(([name]) => !isRequest || name !== 'decision');
  return h('li', {className: 'card pending-card'}, h('div', {className: 'pending-meta'}, h('span', {className: 'pending-recipient'}, `${t('pending.for')}: ${recipient}`)),
    detail && h('div', {className: 'pending-question'}, h('span', {className: 'pending-eyebrow'}, t('pending.question')), h('p', {className: 'pending-prompt'}, detail.node.step.humanTask.prompt)),
    error && h('p', {role: 'alert'}, t(`pending.${error}`)), saved && h('div', {className: 'pending-result', role: 'status', 'aria-live': 'polite'}, h('p', null, t(`pending.${saved}`)), delivery && h('p', null, t(`pending.delivery.${delivery}`)), resumePending && h('button', {type:'button', className:'btn btn-pri', disabled:busy, onClick:resume}, t(busy ? 'pending.sending' : 'pending.resume'))),
    detail && !saved && (unsupported ? h('div', null, h('p', {role: 'alert'}, t('pending.unsupported')), isRequest && h('div', null, h(Field, {name:'responder', spec:{type:'string'}, prefix:run.dagRunId, required:true, value:values.responder, change:(key, value) => setValues(old => ({...old, [key]:value}))}), h('button', {type:'button', className:'btn btn-soft', disabled:busy, onClick:() => {if (window.confirm(t('pending.cancelConfirm'))) submit(null, 'cancelled');}}, t('pending.cancelled')))) : h('form', {onSubmit: event => submit(event)}, h('div', {className: 'pending-fields'}, ...displayFields.map(([name, spec]) => h(Field, {key: name, name, spec, prefix: run.dagRunId, requestWorkflow: isRequest, required: (detail.form.required || []).includes(name) || (isRequest && (name === 'responder' || name === 'answer')), value: values[name], change: (key, value) => setValues(old => ({...old, [key]: value}))}))), h('div', {className: 'pending-actions'}, h('button', {className: 'btn btn-pri', disabled: busy, type: 'submit'}, t(busy ? 'pending.sending' : 'pending.submit')), isRequest && h('button', {className: 'btn btn-soft', disabled: busy, type: 'button', onClick: () => { if (window.confirm(t('pending.cancelConfirm'))) submit(null, 'cancelled'); }}, t('pending.cancelled'))))));
}
function HistoryItem({run}) {
  const {t, i18n} = useTranslation();
  const [open, setOpen] = useState(false), [detail, setDetail] = useState(null), [error, setError] = useState(false);
  const [outputs, setOutputs] = useState(null), [outputsError, setOutputsError] = useState(false), [recordPending, setRecordPending] = useState(false), [recordDelayed, setRecordDelayed] = useState(false);
  useEffect(() => {
    let active = true; const controller = new AbortController(); setError(false); setDetail(null);
    historyDetail(run, controller.signal).then(data => { if (active) setDetail(data); }).catch(() => { if (active) setError(true); });
    return () => {active = false; controller.abort();};
  }, [run.name, run.dagRunId]);
  useEffect(() => {
    if (!open) return;
    let active = true, timer; const controller = new AbortController();
    setOutputs(null); setOutputsError(false); setRecordPending(false); setRecordDelayed(false);
    async function load(attempt) {
      try {
        const current = await historyDetail(run, controller.signal);
        const data = await api(`dag-runs/${enc(run.name)}/${enc(run.dagRunId)}/outputs`, {signal: controller.signal});
        if (!active) return;
        setDetail(current);
        const values = data?.outputs && typeof data.outputs === 'object' ? data.outputs : {};
        const nodes = current?.dagRunDetails?.nodes || [];
        const ask = nodes.find(node => node.step?.id === 'ask');
        const record = nodes.find(node => node.step?.id === 'record');
        const status = String(record?.statusLabel || '').toLowerCase().replace(/[ _-]/g, '');
        const pending = String(ask?.statusLabel || '').toLowerCase() === 'succeeded' && record && ['notstarted','queued','running'].includes(status);
        if (pending && !Object.keys(values).length) {
          setRecordPending(true);
          if (attempt < 9) timer = setTimeout(() => load(attempt + 1), 2000);
          else { setRecordPending(false); setRecordDelayed(true); }
        } else { setRecordPending(false); setOutputs(values); }
      } catch { if (active) setOutputsError(true); }
    }
    load(0);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [open, run.name, run.dagRunId]);
  const ask = detail?.dagRunDetails?.nodes?.find(node => node.step?.humanTask);
  const askStatus = String(ask?.statusLabel || '').toLowerCase();
  const state = askStatus === 'succeeded' ? deliveryState(detail) : ['waiting','running','not_started','queued'].includes(askStatus) ? 'awaitingAnswer' : 'unknown';
  const recipient = assignee(run) === 'team' ? t('pending.team') : assignee(run);
  const finished = readableDate(run.finishedAt, i18n?.language);
  return h('li', {className: 'pending-history-item'}, h('details', {open, onToggle: event => setOpen(event.currentTarget.open)},
    h('summary', null, h('strong', {className:'pending-history-title'}, ask?.step?.humanTask?.prompt?.split(/\r?\n/)[0]?.slice(0, 160) || (error ? t('pending.historyUnknownQuestion') : t('pending.loading'))), h('span', null, `${t('pending.for')}: ${recipient}`), finished && h('time', {dateTime: run.finishedAt}, ` · ${finished}`)),
    error ? h('p', {role:'alert'}, t('pending.detailError')) : !detail ? h('p', {role:'status'}, t('pending.loading')) : h('div', {className:'pending-history-detail'},
      ask?.step?.humanTask?.prompt && h('p', {className:'pending-prompt'}, ask.step.humanTask.prompt),
      h('p', {role:'status'}, t(`pending.delivery.${state}`)),
      outputsError ? h('p', {role:'alert'}, t('pending.outputsError')) : recordDelayed ? h('p', {role:'status'}, t('pending.recordDelayed')) : recordPending ? h('p', {role:'status'}, t('pending.recordPending')) : !outputs ? h('p', {role:'status'}, t('pending.loading')) :
        ['answer','comment','responder','decision'].some(key => typeof outputs[key] === 'string' && outputs[key]) ?
          h('dl', {className:'pending-history-outputs'}, ...['answer','comment','responder','decision'].filter(key => typeof outputs[key] === 'string' && outputs[key]).flatMap(key => [h('dt', {key:`${key}-label`}, t(`pending.recorded.${key}`)), h('dd', {key}, key === 'decision' && ['answered','cancelled','expired'].includes(outputs[key]) ? t(`pending.recordedDecision.${outputs[key]}`) : outputs[key])])) :
          h('p', {className:'pending-history-note'}, t('pending.answerHistoryNote')))));
}
function Pending() {
  const {t} = useTranslation();
  const {project} = useStore();
  let historyUrl = '';
  try { const url = new URL(project.data?.urls?.dagu); if (['http:', 'https:'].includes(url.protocol)) historyUrl = `${url.origin}/dags/ext-human-requests-request`; } catch { /* project configuration is still loading */ }
  const [runs, setRuns] = useState([]), [filter, setFilter] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState(false), [generation, setGeneration] = useState(0);
  const [history, setHistory] = useState(null), [historyError, setHistoryError] = useState(false), [lastSubmitted, setLastSubmitted] = useState(null);
  const historyGeneration = useRef(0);
  useEffect(() => { let active = true; setLoading(true); setError(false); listRequests().then(data => active && setRuns(data)).catch(() => active && setError(true)).finally(() => active && setLoading(false)); return () => {active = false;}; }, [generation]);
  useEffect(() => { let active = true; setHistory(null); setHistoryError(false); latestHistory(historyGeneration, () => active, setHistory, () => setHistoryError(true)); return () => {active = false;}; }, [generation]);
  useEffect(() => {
    if (!lastSubmitted) return;
    let active = true, timer;
    async function refresh(attempt) {
      const data = await latestHistory(historyGeneration, () => active, value => {setHistory(value); setHistoryError(false);}, () => setHistoryError(true));
      if (!data || !active) return;
      const found = data.runs.some(run => run.name === lastSubmitted.name && run.dagRunId === lastSubmitted.dagRunId);
      if (!found && attempt < 9) timer = setTimeout(() => refresh(attempt + 1), 1000);
    }
    refresh(0);
    return () => {active = false; clearTimeout(timer);};
  }, [lastSubmitted]);
  const visible = runs.filter(run => !filter.trim() || assignee(run).toLowerCase().includes(filter.trim().toLowerCase()));
  const visibleHistory = (history?.runs || []).filter(run => !filter.trim() || assignee(run).toLowerCase().includes(filter.trim().toLowerCase()));
  return h('main', {className: 'pending-page'}, h('header', {className: 'pending-header'}, h('h1', null, t('pending.title')), h('p', null, t('pending.intro'))),
    h('div', {className: 'pending-toolbar'}, h('label', null, t('pending.filter'), h('input', {value: filter, placeholder: t('pending.all'), onChange: e => setFilter(e.target.value)})), h('button', {type: 'button', className: 'btn btn-soft', onClick: () => setGeneration(generation + 1)}, t('pending.refresh'))),
    loading ? h('p', {role: 'status'}, t('pending.loading')) : error ? h('p', {role: 'alert'}, t('pending.error')) : visible.length ? h('ul', {className: 'pending-list'}, ...visible.map(run => h(Request, {key: `${run.name}/${run.dagRunId}`, run, onDone: () => setLastSubmitted({name: run.name, dagRunId: run.dagRunId})}))) : h('div', {className: 'pending-empty'}, h('p', null, t('pending.empty')), h('span', null, t('pending.emptyHelp'))),
    h('section', {className:'pending-history', 'aria-labelledby':'history-title'}, h('h2', {id:'history-title'}, t('pending.historyTitle')), h('p', null, t('pending.historyIntro')),
      historyError ? h('p', {role:'alert'}, t('pending.historyError')) : !history ? h('p', {role:'status'}, t('pending.loading')) : visibleHistory.length ? h('ul', {className:'pending-history-list'}, ...visibleHistory.map(run => h(HistoryItem, {key:`${run.name}/${run.dagRunId}`,run}))) : h('p', null, t('pending.historyEmpty')),
      history?.truncated && h('p', {className:'pending-history-note'}, t('pending.historyLimited'))),
    h('footer', {className: 'pending-footer'}, h('p', null, t('pending.identity')), historyUrl && h('a', {href: historyUrl, target: '_blank', rel: 'noopener noreferrer'}, t('pending.history'))));
}
mountExtensionPage(Pending, messages);
