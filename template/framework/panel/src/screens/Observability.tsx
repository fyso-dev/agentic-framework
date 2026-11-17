import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DailyUsage, Observation, SubscriptionWindow, Usage } from "../api/observability";
import { DAGS } from "../api/types";
import { ActionButton, ActionStatus } from "../components/Action";
import { External, RelTime } from "../components/ui";
import { UsageChart, type ChartSeries } from "../components/UsageChart";
import { useNow, useTimeFormat } from "../lib/time";
import { useDaguAction } from "../lib/useDaguAction";
import { useStore } from "../store";

const usdKeys = ["apiReportedUsd", "subscriptionEquivalentUsd", "estimatedApiUsd", "unclassifiedUsd"] as const;
const tokenKeys = ["input", "cachedInput", "output", "reasoning"] as const;
const countKeys = ["turns", "missingCost", "missingTokens"] as const;
type Period = "month" | "week" | "today";
const sum = (values: (number | null | undefined)[]) => values.some(v => v != null) ? values.reduce<number>((n, v) => n + (v ?? 0), 0) : null;

/** Totals of a set of daily rows; unknown stays null (D26). */
function total(rows: DailyUsage[]) {
  const out: Record<string, number | null> = {};
  for (const k of [...usdKeys, ...tokenKeys]) out[k] = sum(rows.map(r => r[k]));
  for (const k of countKeys) out[k] = rows.reduce((n, r) => n + (r[k] ?? 0), 0);
  return out as Usage & { reasoning: number | null };
}

/** Every UTC day between two dates, inclusive. */
function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`) && out.length < 62; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function Observability() {
  const { t, i18n } = useTranslation();
  const { backend, project, mock } = useStore();
  const [data, setData] = useState<Observation>();
  const [error, setError] = useState(false);
  const [bot, setBot] = useState("");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [period, setPeriod] = useState<Period>("month");
  const [metric, setMetric] = useState<"tokens" | "cost">("tokens");
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
  const lang = i18n.language;
  const number = useCallback((value: number | null | undefined) => value == null ? t("observ.unknown") : new Intl.NumberFormat(lang).format(value), [t, lang]);
  const compact = useCallback((value: number) => new Intl.NumberFormat(lang, {notation:"compact", maximumFractionDigits:1}).format(value), [lang]);
  const money = useCallback((value: number | null | undefined) => value == null ? t("observ.unknown") : new Intl.NumberFormat(lang, {style:"currency", currency:"USD", maximumFractionDigits:4}).format(value), [t, lang]);
  const axisMoney = useCallback((value: number) => new Intl.NumberFormat(lang, {style:"currency", currency:"USD", notation:"compact", maximumFractionDigits:2}).format(value), [lang]);
  const formatDay = useCallback((day: string) => new Intl.DateTimeFormat(lang, {day:"numeric", month:"short", timeZone:"UTC"}).format(new Date(`${day}T00:00:00Z`)), [lang]);
  const daily = useMemo(() => data?.daily ?? [], [data]);
  const days = useMemo(() => {
    if (!data) return [];
    const all = daysBetween(data.from, data.to);
    return period === "month" ? all : all.slice(period === "week" ? -7 : -1);
  }, [data, period]);
  const rows = useMemo(() => daily.filter(r => days.includes(r.day) && (!bot || r.bot === bot) && (!model || r.model === model) && (!engine || r.engine === engine)), [daily, days, bot, model, engine]);
  const totals = useMemo(() => total(rows), [rows]);
  const groups = useMemo(() => {
    const by = new Map<string, DailyUsage[]>();
    for (const r of rows) {const key = JSON.stringify([r.bot, r.model, r.engine]); by.set(key, [...(by.get(key) ?? []), r]);}
    return [...by.values()].map(list => ({bot:list[0].bot, model:list[0].model, engine:list[0].engine, ...total(list)}))
      .sort((a, b) => (sum([b.input, b.output]) ?? -1) - (sum([a.input, a.output]) ?? -1));
  }, [rows]);
  const series = useMemo<ChartSeries[]>(() => {
    const perDay = days.map(d => total(rows.filter(r => r.day === d)));
    if (metric === "cost") return usdKeys.map((k, i) => ({label:t(`observ.${k}`), token:`--fy-chart-${i + 1}`, values:perDay.map(u => u[k])}));
    return [
      {label:t("observ.freshInput"), token:"--fy-chart-1", values:perDay.map(u => u.input == null ? null : u.input - (u.cachedInput ?? 0))},
      {label:t("observ.cache"), token:"--fy-chart-2", values:perDay.map(u => u.cachedInput)},
      {label:t("observ.output"), token:"--fy-chart-3", values:perDay.map(u => u.output)},
    ];
  }, [days, rows, metric, t]);
  const traceUrl = (id: string, at?: number) => `${project.data?.urls.omb}/api/usage/traces/${encodeURIComponent(id)}${at ? `?at=${at}` : ""}`;
  const dagUrl = (dag: string) => `${project.data?.urls.dagu}/dags/${encodeURIComponent(dag)}`;
  const stamp = (v: string | number) => Number.isFinite(new Date(v).getTime()) ? new Intl.DateTimeFormat(lang, {dateStyle:"short",timeStyle:"short"}).format(new Date(v)) : t("observ.unknown");
  const costDetail = (usage: Usage) => usdKeys.some(k=>usage[k] !== null)
    ? <>{usdKeys.filter(k=>usage[k] !== null).map(k=><div key={k}>{t(`observ.${k}`)}: {money(usage[k])}</div>)}</>
    : t("observ.unknown");
  const firstDay = days.length ? Date.parse(`${days[0]}T00:00:00Z`) : 0;
  const traces = (data?.traces ?? []).filter(r => (!bot || r.bots.some(b => b.name === bot)) && r.startedAt >= firstDay);
  const partial = data && (data.warnings.length > 0 || Object.values(data.sources).some(s => !["ok", "empty"].includes(s)));
  const engineLabel = (id: string | null | undefined) => !id || id === "unknown" ? t("observ.unknown") : id;
  const accounts = useMemo(() => {
    const by = new Map<string, SubscriptionWindow[]>();
    for (const w of data?.subscription ?? []) by.set(w.instanceId, [...(by.get(w.instanceId) ?? []), w]);
    const all = [...by.entries()];
    return {known:all.filter(([, w]) => w.some(x => x.usedPercent != null)), unknown:all.filter(([, w]) => w.every(x => x.usedPercent == null))};
  }, [data]);
  const unique = (values: string[]) => [...new Set(values)].sort();
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
        {Object.entries(data.sources).filter(([source]) => source !== "runs").map(([source,status]) => <span key={source} className={`pill ${status === "unavailable" ? "pill-down" : "pill-unk"}`}>{t(`observ.sources.${source}`, {defaultValue:source})}: {t(`observ.sourceState.${status}`)}</span>)}
      </div>
      {partial && <div className="banner banner-down" role="alert">{t("observ.partial")} {data.warnings.map(w => t(`observ.warning.${w}`)).join(" · ")}</div>}

      <section className="observ-section" aria-labelledby="observ-plan">
        <h2 className="section-title" id="observ-plan">{t("observ.plan.title")}</h2>
        <div className="card plan-usage">
          <p className="mute">{t("observ.plan.note")}</p>
          {data.sources.subscription === "unavailable" && <p className="pill pill-unk">{t("observ.plan.unavailable")}</p>}
          {data.sources.subscription !== "unavailable" && !accounts.known.length && !accounts.unknown.length && <p className="observ-empty">{t("observ.plan.none")}</p>}
          <div className="plan-accounts">
            {accounts.known.map(([id, windows]) => <article key={id} className="plan-account">
              <h3><span className="plan-engine">{engineLabel(windows[0].engine)}</span>{windows[0].plan && <span className="pill pill-outline">{windows[0].plan}</span>}{accounts.known.filter(([, w]) => w[0].engine === windows[0].engine).length > 1 && <span className="mute mono"> {id}</span>}</h3>
              {(["fiveHour", "weekly"] as const).map(name => {
                const w = windows.find(x => x.window === name);
                const used = w?.usedPercent ?? null;
                return <div key={name} className="plan-window">
                  <div className="plan-window-head"><span>{t(`observ.plan.${name}`)}</span><strong>{used == null ? t("observ.unknown") : new Intl.NumberFormat(lang, {style:"percent", maximumFractionDigits:0}).format(used / 100)}</strong></div>
                  <div className="plan-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={used ?? undefined} aria-label={t(`observ.plan.${name}`)} data-level={used == null ? "unknown" : used >= 90 ? "down" : used >= 70 ? "warn" : "ok"}><span style={{width:`${used ?? 0}%`}} /></div>
                  <div className="plan-window-foot mute">
                    {w?.resetsAt ? <span title={f.exact(w.resetsAt)}>{t("observ.plan.resets", {when:f.relative(w.resetsAt, now)})}</span> : <span>{t("observ.plan.noReset")}</span>}
                    {w?.checkedAt && <span title={f.exact(w.checkedAt)}>{t("observ.plan.checked", {when:f.relative(w.checkedAt, now)})}</span>}
                  </div>
                </div>;
              })}
            </article>)}
          </div>
          {accounts.unknown.length > 0 && <p className="mute">{t("observ.plan.unknownAccounts", {engines:accounts.unknown.map(([id, w]) => w[0].engine && w[0].engine !== id ? `${engineLabel(w[0].engine)} (${id})` : engineLabel(id)).join(", ")})}</p>}
          {(accounts.known.length > 0 || accounts.unknown.length > 0) && <p className="mute">{t("observ.plan.unknownNote")}</p>}
        </div>
      </section>

      <div className="observ-filters">
        <label>{t("observ.period")} <select className="select" value={period} onChange={e => setPeriod(e.target.value as Period)}>{(["month", "week", "today"] as const).map(p => <option key={p} value={p}>{t(`observ.periods.${p}`)}</option>)}</select></label>
        <label>{t("observ.bot")} <select className="select" value={bot} onChange={e => setBot(e.target.value)}><option value="">{t("observ.all")}</option>{unique(daily.map(g=>g.bot)).map(b=><option key={b}>{b}</option>)}</select></label>
        <label>{t("observ.model")} <select className="select" value={model} onChange={e => setModel(e.target.value)}><option value="">{t("observ.all")}</option>{unique(daily.map(g=>g.model)).map(m=><option key={m} value={m}>{m === "unknown" ? t("observ.unknown") : m}</option>)}</select></label>
        <label>{t("observ.engine")} <select className="select" value={engine} onChange={e => setEngine(e.target.value)}><option value="">{t("observ.all")}</option>{unique(daily.map(g=>g.engine)).map(m=><option key={m} value={m}>{engineLabel(m)}</option>)}</select></label>
      </div>

      <section className="observ-section" aria-labelledby="observ-chart">
        <div className="observ-chart-head">
          <h2 className="section-title grow" id="observ-chart">{t("observ.chart")}</h2>
          <div className="segmented" role="group" aria-label={t("observ.metric")}>
            {(["tokens", "cost"] as const).map(m => <button key={m} type="button" className={metric === m ? "active" : ""} aria-pressed={metric === m} onClick={() => setMetric(m)}>{t(`observ.metrics.${m}`)}</button>)}
          </div>
        </div>
        <div className="card observ-chart">
          {daily.length ? <UsageChart days={days} series={series} label={t("observ.chartLabel", {metric:t(`observ.metrics.${metric}`)})}
            format={metric === "cost" ? money : number} formatDay={formatDay} axis={metric === "cost" ? axisMoney : compact} /> : <p className="observ-empty">{t("observ.empty")}</p>}
          <p className="mute">{t(metric === "cost" ? "observ.costNote" : "observ.tokenNote")}</p>
        </div>
      </section>

      <section className="observ-grid" aria-label={t("observ.tokens")}>
        <article className="card observ-stat"><span className="mute">{t("observ.turns")}</span><strong className="stat">{number(totals.turns)}</strong></article>
        {tokenKeys.map(key => <article key={key} className="card observ-stat"><span className="mute">{t(`observ.${key === "cachedInput" ? "cache" : key}`)}</span><strong className="stat">{number(totals[key])}</strong></article>)}
      </section>
      <section className="observ-grid" aria-label={t("observ.costs")}>
        {usdKeys.map(key => <article key={key} className="card observ-stat"><span className="mute">{t(`observ.${key}`)}</span><strong className="stat">{money(totals[key])}</strong></article>)}
      </section>
      {(totals.missingCost > 0 || totals.missingTokens > 0) && <p className="pill pill-warn">{t("observ.coverage", {count:totals.missingCost})} · {t("observ.missingTokens", {count:totals.missingTokens})}</p>}

      <section className="observ-section"><h2 className="section-title">{t("observ.usage")}</h2><div className="card observ-table-wrap"><table className="observ-table"><thead><tr>{["bot","model","engine","turns","input","cache","output","reasoning","costs"].map(k=><th key={k} scope="col">{t(`observ.${k}`)}</th>)}</tr></thead><tbody>
        {groups.map((g,i)=><tr key={i}><td>{g.bot}</td><td>{g.model === "unknown" ? t("observ.unknown") : g.model}</td><td>{engineLabel(g.engine)}</td><td>{number(g.turns)}</td><td>{number(g.input)}</td><td>{number(g.cachedInput)}</td><td>{number(g.output)}</td><td>{number(g.reasoning)}</td><td>{costDetail(g)}</td></tr>)}
      </tbody></table>{!groups.length && <p className="observ-empty">{t("observ.empty")}</p>}</div></section>

      <section className="observ-section"><h2 className="section-title">{t("observ.conversations")}</h2>{(model || engine) && <p className="mute">{t("observ.conversationModel")}</p>}<div className="card observ-table-wrap"><table className="observ-table"><thead><tr>{["bot","started","duration","tools","errors","input","output","costs","details"].map(k=><th key={k}>{t(`observ.${k}`)}</th>)}</tr></thead><tbody>
        {traces.map(r=><tr key={r.id}><td>{r.bots.map(b=>b.name).join(", ")}</td><td title={f.exact(r.startedAt)}>{stamp(r.startedAt)}</td><td>{f.seconds(r.durationMs/1000)} {r.running && t("observ.running")}</td><td>{r.tools}</td><td>{r.errors}</td><td>{number(r.usage.input)}</td><td>{number(r.usage.output)}</td><td>{costDetail(r.usage)}</td><td><External href={traceUrl(r.id,r.startedAt)}>{t("observ.details")}</External></td></tr>)}
      </tbody></table>{!traces.length && <p className="observ-empty">{t("observ.empty")}</p>}</div></section>

      <section className="observ-section"><h2 className="section-title">{t("observ.alerts")}</h2><div className="card">
        {!data.alerts.length ? <p className="observ-empty">{t("observ.noAlerts")}</p> : <ul className="list">{data.alerts.map((a,i)=><li key={i} className="row"><span className="grow">{t(`observ.alert.${a.kind}`, {value:number(a.value), limit:number(a.limit)})}</span>{a.dag && <External href={dagUrl(a.dag)}>{t("common.logs")}</External>}{a.traceId && <External href={traceUrl(a.traceId)}>{t("observ.details")}</External>}</li>)}</ul>}
      </div><p className="mute">{t("observ.alertNote")}</p></section>
    </>}
  </main>;
}
