import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Observation, Usage } from "../api/observability";
import { DAGS } from "../api/types";
import { ActionButton, ActionStatus } from "../components/Action";
import { External, RelTime } from "../components/ui";
import { useNow, useTimeFormat } from "../lib/time";
import { useDaguAction } from "../lib/useDaguAction";
import { useStore } from "../store";

const usdKeys = ["apiReportedUsd", "subscriptionEquivalentUsd", "estimatedApiUsd", "unclassifiedUsd"] as const;
const sum = (values: (number | null)[]) => values.some(v => v !== null) ? values.reduce<number>((n, v) => n + (v ?? 0), 0) : null;

export function Observability() {
  const { t, i18n } = useTranslation();
  const { backend, project, mock } = useStore();
  const [data, setData] = useState<Observation>();
  const [error, setError] = useState(false);
  const [bot, setBot] = useState("");
  const [model, setModel] = useState("");
  const [dag, setDag] = useState("");
  const generation = useRef(0);
  const now = useNow();
  const f = useTimeFormat();
  const action = useDaguAction(backend, DAGS.observability, "summary", {loadLast:true});
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const epoch = ++generation.current;
      try {
        const result = await backend.getObservability();
        if (alive && epoch === generation.current) {setData(result); setError(false);}
      } catch {if (alive && epoch === generation.current) setError(true);}
    };
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {alive=false; generation.current++; clearInterval(timer);};
  }, [backend, action.phase]);
  const groups = useMemo(() => (data?.usage.groups ?? []).filter(g => (!bot || g.bot === bot) && (!model || g.model === model)), [data, bot, model]);
  const filtered = !!bot || !!model;
  const totals = data?.usage.totals;
  const amount = (key: keyof Usage) => filtered ? sum(groups.map(g => g[key])) : totals?.[key] ?? null;
  const number = (value: number | null | undefined) => value == null ? t("observ.unknown") : new Intl.NumberFormat(i18n.language).format(value);
  const money = (value: number | null | undefined) => value == null ? t("observ.unknown") : new Intl.NumberFormat(i18n.language, {style:"currency", currency:"USD", maximumFractionDigits:4}).format(value);
  const costDetail = (usage: Usage) => usdKeys.some(k=>usage[k] !== null)
    ? <>{usdKeys.filter(k=>usage[k] !== null).map(k=><div key={k}>{t(`observ.${k}`)}: {money(usage[k])}</div>)}</>
    : t("observ.unknown");
  const traceUrl = (id: string, at?: number) => `${project.data?.urls.omb}/api/usage/traces/${encodeURIComponent(id)}${at ? `?at=${at}` : ""}`;
  const dagUrl = (dag: string) => `${project.data?.urls.dagu}/dags/${encodeURIComponent(dag)}`;
  const stamp = (v: string | number) => Number.isFinite(new Date(v).getTime()) ? new Intl.DateTimeFormat(i18n.language, {dateStyle:"short",timeStyle:"short"}).format(new Date(v)) : t("observ.unknown");
  const traces = (data?.traces ?? []).filter(r => !bot || r.bots.some(b => b.name === bot));
  const partial = data && (data.warnings.length > 0 || Object.values(data.sources).some(s => !["ok", "empty"].includes(s)));
  const missingCost = amount("missingCost");
  const missingTokens = amount("missingTokens");
  return <main className="page page-wide">
    <div className="page-head">
      <div className="grow"><h1>{t("observ.title")}</h1><p>{t("observ.subtitle")}</p></div>
      <ActionButton action={action} size="md" label={t("observ.refresh")} busyLabel={t("common.verifying")} onRun={() => void action.start()} />
    </div>
    <ActionStatus action={action} />
    {mock && <p role="status">{t("observ.mock")}</p>}
    {error && <div className="banner banner-down" role="alert">{t("observ.loadError")}</div>}
    {!data && !error && <p role="status">{t("common.loading")}</p>}
    {action.error && <p role="alert">{action.error} <External href={dagUrl(DAGS.observability)}>{t("common.logs")}</External></p>}
    {data && <>
      <div className="observ-source">
        <span className="mute">{t("observ.window", {from:data.from, to:data.to})}</span>
        <span className="mute">{t("observ.collected")} <RelTime at={data.collectedAt} /></span>
        {now-Date.parse(data.collectedAt)>300000 && <span className="pill pill-warn" role="status">{t("observ.stale")}</span>}
        {Object.entries(data.sources).map(([source,status]) => <span key={source} className={`pill ${status === "unavailable" ? "pill-down" : "pill-unk"}`}>{t(`observ.sources.${source}`)}: {t(`observ.sourceState.${status}`)}</span>)}
      </div>
      {partial && <div className="banner banner-down" role="alert">{t("observ.partial")} {data.warnings.map(w => t(`observ.warning.${w}`)).join(" · ")}</div>}
      {(data.coverage.runsTruncated || data.coverage.tracesTruncated) && <p role="status" className="pill pill-warn">{t("observ.truncated")}</p>}
      <div className="observ-filters">
        <label>{t("observ.botOrWorkflow")} <select className="select" value={bot} onChange={e => setBot(e.target.value)}><option value="">{t("observ.all")}</option>{[...new Set(data.usage.groups.map(g=>g.bot))].map(b=><option key={b}>{b}</option>)}</select></label>
        <label>{t("observ.model")} <select className="select" value={model} onChange={e => setModel(e.target.value)}><option value="">{t("observ.all")}</option>{[...new Set(data.usage.groups.map(g=>g.model))].map(m=><option key={m} value={m}>{m === "unknown" ? t("observ.unknown") : m}</option>)}</select></label>
        <span className="mute">{t("observ.filterScope")}</span>
      </div>
      <section className="observ-grid" aria-label={t("observ.costs")}>
        {usdKeys.map(key => <article key={key} className="card observ-stat"><span className="mute">{t(`observ.${key}`)}</span><strong className="stat">{money(amount(key))}</strong></article>)}
      </section>
      <p className="mute">{t("observ.costNote")}</p>
      <div className="observ-source"><span>{t("observ.turns")}: {number(amount("turns"))}</span><span>{t("observ.input")}: {number(amount("input"))}</span><span>{t("observ.output")}: {number(amount("output"))}</span><span>{t("observ.cache")}: {number(amount("cachedInput"))}</span></div>
      {((missingCost ?? 0) > 0 || (missingTokens ?? 0) > 0) && <p className="pill pill-warn">{t("observ.coverage", {count:missingCost ?? 0})} · {t("observ.missingTokens", {count:missingTokens ?? 0})}</p>}
      <section className="observ-section"><h2 className="section-title">{t("observ.alerts")}</h2><div className="card">
        {!data.alerts.length ? <p className="observ-empty">{t("observ.noAlerts")}</p> : <ul className="list">{data.alerts.map((a,i)=><li key={i} className="row"><span className="grow">{t(`observ.alert.${a.kind}`, {value:number(a.value), limit:number(a.limit)})}</span>{a.dag && <External href={dagUrl(a.dag)}>{t("common.logs")}</External>}{a.traceId && <External href={traceUrl(a.traceId)}>{t("observ.details")}</External>}</li>)}</ul>}
      </div><p className="mute">{t("observ.alertNote")}</p></section>
      <section className="observ-section"><h2 className="section-title">{t("observ.usage")}</h2><div className="card observ-table-wrap"><table className="observ-table"><thead><tr>{["botOrWorkflow","model","source","turns","input","output","costs"].map(k=><th key={k} scope="col">{t(`observ.${k}`)}</th>)}</tr></thead><tbody>
        {groups.map((g,i)=><tr key={i}><td>{g.bot}</td><td>{g.model === "unknown" ? t("observ.unknown") : g.model}</td><td>{t(`observ.sources.${g.source === "omb" ? "ledger" : "harness"}`)}</td><td>{number(g.turns)}</td><td>{number(g.input)}</td><td>{number(g.output)}</td><td>{costDetail(g)}</td></tr>)}
      </tbody></table>{!groups.length && <p className="observ-empty">{t("observ.empty")}</p>}</div></section>
      <section className="observ-section"><h2 className="section-title">{t("observ.conversations")}</h2>{model && <p className="mute">{t("observ.conversationModel")}</p>}<div className="card observ-table-wrap"><table className="observ-table"><thead><tr>{["bot","started","duration","tools","errors","input","output","costs","details"].map(k=><th key={k}>{t(`observ.${k}`)}</th>)}</tr></thead><tbody>
        {traces.map(r=><tr key={r.id}><td>{r.bots.map(b=>b.name).join(", ")}</td><td title={f.exact(r.startedAt)}>{stamp(r.startedAt)}</td><td>{f.seconds(r.durationMs/1000)} {r.running && t("observ.running")}</td><td>{r.tools}</td><td>{r.errors}</td><td>{number(r.usage.input)}</td><td>{number(r.usage.output)}</td><td>{costDetail(r.usage)}</td><td><External href={traceUrl(r.id,r.startedAt)}>{t("observ.details")}</External></td></tr>)}
      </tbody></table>{!traces.length && <p className="observ-empty">{t("observ.empty")}</p>}</div></section>
      <section className="observ-section"><h2 className="section-title">{t("observ.runs")}</h2><label className="observ-filters">{t("observ.workflow")} <select className="select" value={dag} onChange={e=>setDag(e.target.value)}><option value="">{t("observ.all")}</option>{[...new Set(data.runs.map(r=>r.dag))].sort().map(name=><option key={name}>{name}</option>)}</select></label><div className="card observ-table-wrap"><table className="observ-table"><thead><tr>{["workflow","status","started","duration","retries","input","output","costs","conversation"].map(k=><th key={k}>{t(`observ.${k}`)}</th>)}</tr></thead><tbody>
        {data.runs.filter(r=>!dag || r.dag === dag).map(r=><tr key={`${r.dag}/${r.id}`}><td><External href={dagUrl(r.dag)}>{r.dag}</External><br/><span className="mute mono" title={r.id}>{r.id.length > 22 ? `${r.id.slice(0,14)}…${r.id.slice(-5)}` : r.id}</span></td><td>{t(`observ.statuses.${r.statusLabel}`,{defaultValue:r.statusLabel})}</td><td title={f.exact(r.startedAt)}>{stamp(r.startedAt)}</td><td>{Number.isFinite(Date.parse(r.startedAt)) ? f.seconds((Number.isFinite(Date.parse(r.finishedAt)) ? Date.parse(r.finishedAt)-Date.parse(r.startedAt) : now-Date.parse(r.startedAt))/1000) : t("observ.unknown")}</td><td>{r.retries}</td><td>{number(r.usage.input)}</td><td>{number(r.usage.output)}</td><td>{costDetail(r.usage)}</td><td>{r.traceId ? <External href={traceUrl(r.traceId)}>{t("observ.details")}</External> : t(r.sourceThread ? "observ.threadOnly" : "observ.unlinked")}</td></tr>)}
      </tbody></table>{!data.runs.filter(r=>!dag || r.dag === dag).length && <p className="observ-empty">{t("observ.empty")}</p>}</div></section>
    </>}
  </main>;
}
