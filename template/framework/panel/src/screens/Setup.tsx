// Setup checklist (home): engines, bots applied, bots connected to Dagu, last git save,
// plus one step per installed extension that declares setup.yaml (D51).
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { IdentityCard } from "../components/Identity";
import type { Engine, Extension } from "../api/types";
import { ActionButton, ActionError, ActionStatus, useLogsUrl } from "../components/Action";
import { ExtensionSetup } from "../components/ExtensionSetup";
import { Spinner } from "../components/Icons";
import { GlobalState } from "../components/Layout";
import { CopyLine, External, RelTime } from "../components/ui";
import { localized } from "../lib/i18n";
import { useDaguAction, type Action } from "../lib/useDaguAction";
import { href } from "../lib/router";
import { embedded, useStore, type StepState } from "../store";

function StepIcon({ state }: { state: StepState }) {
  const glyph = state === "done" ? "✓" : state === "failed" ? "×" : null;
  return (
    <span aria-hidden="true" className={`step-icon ${state}`}>
      {state === "checking" || state === "loading" ? <Spinner size={14} /> : glyph}
    </span>
  );
}

function Step({ state, title, side, mobile, children }: {
  state: StepState;
  title: string;
  side: ReactNode;
  /** Full-width actions shown instead of `side` on phones. */
  mobile?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <li className={`step${state === "failed" ? " is-failed" : ""}${mobile ? " is-stacked" : ""}`}>
      <StepIcon state={state} />
      <div className="step-body">
        <h3>
          {title} <span className={`step-state st-${state}`}>{t(`setup.state.${state}`)}</span>
        </h3>
        {children}
      </div>
      <div className="step-side">{side}</div>
      {mobile && <div className="step-mobile-actions">{mobile}</div>}
    </li>
  );
}

/** "Claude (suscripción)" / "Claude API" when two engines share a label; else just "Codex". */
export function useEngineName() {
  const { t } = useTranslation();
  const { checkData } = useStore();
  return (e: Engine) =>
    (checkData?.engines ?? []).filter((x) => x.label === e.label).length > 1
      ? t(`setup.engines.chip_${e.kind}`, { label: e.label })
      : e.label;
}


function EnginesStep() {
  const { t } = useTranslation();
  const { check, checkData, steps } = useStore();
  const name = useEngineName();
  const logs = useLogsUrl(check.dag);
  const state = steps.engines;
  const runFailed = check.phase === "failed";
  const bad = checkData?.engines.filter((e) => !e.ok) ?? [];
  const failed = state === "failed";
  const run = () => void check.start();
  const button = (cls = "") => (
    <ActionButton
      action={check}
      label={failed ? t("common.retry") : t("common.verify")}
      busyLabel={t("common.verifying")}
      onRun={run}
      primary={failed}
      className={cls}
    />
  );

  let body: ReactNode;
  if (runFailed) body = <ActionError action={check} />;
  else if (!checkData) body = <p className="step-detail">{state === "loading" ? t("common.loading") : t("setup.engines.never")}</p>;
  else if (checkData.engines.length === 0) body = <p className="step-detail">{t("setup.engines.none")}</p>;
  else if (bad.length === 0)
    body = <p className="step-detail">{checkData.engines.map((e) => `${name(e)} ✓`).join(" · ")}</p>;
  else
    body = (
      <>
        <p className="chips">
          {checkData.engines.map((e) => (
            <span key={e.id} className={`chip ${e.ok ? "ok" : "bad"}`}>
              <span aria-hidden="true" className="glyph">{e.ok ? "✓" : "×"}</span>
              {name(e)}
              <span className="sr-only"> ({e.ok ? t("setup.engines.okSr") : t("setup.engines.badSr")})</span>
            </span>
          ))}
        </p>
        <p role="alert" className="step-error">
          {bad.map((e) => t(`setup.engines.err_${e.kind}`, { label: e.label })).join(" ")}
          <span className="only-desktop"><External href={logs}>{t("common.logs")} </External></span>
        </p>
        {bad.some((e) => e.fixHint) && (
          <div className="help">
            <p>{t("setup.engines.help")}</p>
            {bad.filter((e) => e.fixHint).map((e) => <CopyLine key={e.id} text={e.fixHint!} />)}
          </div>
        )}
      </>
    );

  return (
    <Step
      state={state}
      title={t("setup.engines.title")}
      side={<><span className="step-meta"><ActionStatus action={check} /></span>{button()}</>}
      mobile={failed ? <><External href={logs} className="btn btn-sm btn-soft">{t("common.logsShort")} </External>{button()}</> : undefined}
    >
      {body}
    </Step>
  );
}

function BotsStep() {
  const { t } = useTranslation();
  const { steps, checkData, draftChanges, workingBots } = useStore();
  const state = steps.bots;
  let detail: string;
  if (draftChanges > 0) detail = t("setup.bots.changes", { count: draftChanges });
  else if (checkData?.bots.error) detail = t("setup.bots.invalid", { error: checkData.bots.error });
  else if (checkData) detail = checkData.bots.ok
    ? t("setup.bots.ok", { count: checkData.bots.count })
    : t("setup.bots.changes", { count: checkData.bots.pending });
  else detail = state === "loading" ? t("common.loading") : t("setup.bots.never", { count: workingBots.length });
  const pending = state === "pending";
  const link = pending
    ? <a href={href.review} className="btn btn-sm btn-pri">{t("setup.bots.review")} <span aria-hidden="true">→</span></a>
    : <a href={href.bots} className="btn btn-sm btn-soft">{state === "never" ? t("setup.bots.reviewPlain") : t("setup.bots.view")}</a>;
  return (
    <Step state={state} title={t("setup.bots.title")} side={link} mobile={pending ? link : undefined}>
      <p className="step-detail">{detail}</p>
    </Step>
  );
}

function DaguStep() {
  const { t } = useTranslation();
  const { steps, check, checkData } = useStore();
  const state = steps.dagu;
  let body: ReactNode;
  if (check.phase === "failed") body = <ActionError action={check} />;
  else if (!checkData) body = <p className="step-detail">{state === "loading" ? t("common.loading") : t("setup.dagu.never")}</p>;
  else if (!checkData.dagu.ok) body = <p role="alert" className="step-error">{t("setup.dagu.down")}</p>;
  else {
    const { botsConnected: n } = checkData.dagu;
    const count = checkData.bots.count;
    body = (
      <p className="step-detail">
        {n === 0 ? t("setup.dagu.none") : n >= count ? t("setup.dagu.all", { count: n }) : t("setup.dagu.some", { connected: n, count })}
      </p>
    );
  }
  return (
    <Step
      state={state}
      title={t("setup.dagu.title")}
      side={<>
        <span className="step-meta"><ActionStatus action={check} /></span>
        <ActionButton action={check} label={t("common.verify")} busyLabel={t("common.verifying")} onRun={() => void check.start()} primary={state === "failed"} />
      </>}
    >
      {body}
    </Step>
  );
}

function GitStep() {
  const { t } = useTranslation();
  const { steps, snapshot } = useStore();
  const logs = useLogsUrl(snapshot.dag);
  const state = steps.git;
  const finished = snapshot.run?.finishedAt;
  const result = snapshot.phase === "ok" && typeof snapshot.output === "string" ? snapshot.output : null;
  const sha = result?.startsWith("committed ") ? result.slice(10).trim() : null;
  let body: ReactNode;
  if (state === "failed") body = <ActionError action={snapshot} />;
  else if (state === "never") body = <p className="step-detail">{t("setup.git.never")}</p>;
  else if (state === "loading") body = <p className="step-detail">{t("common.loading")}</p>;
  else
    body = (
      <p className="step-detail">
        {finished ? (
          <>
            <span className="only-desktop"><RelTime at={finished} prefix={(rel) => t("setup.git.last", { when: rel })} /></span>
            <span className="only-mobile"><RelTime at={finished} prefix={(rel) => rel.charAt(0).toLocaleUpperCase() + rel.slice(1)} /></span>
          </>
        ) : t("setup.git.saving")}
        {result && <> · {sha ? t("setup.git.committed", { sha }) : t("setup.git.noChanges")}</>}
        <span className="only-mobile"> · <External href={logs} arrow={false}>{t("common.viewInDagu")}</External></span>
      </p>
    );
  return (
    <Step
      state={state}
      title={t("setup.git.title")}
      side={<>
        {snapshot.phase === "running" && <span className="step-meta"><ActionStatus action={snapshot} /></span>}
        <External href={logs} className="step-link">{t("common.viewInDagu")} </External>
        <ActionButton action={snapshot} label={<><span className="only-desktop">{t("setup.git.save")}</span><span className="only-mobile">{t("setup.git.saveShort")}</span></>} busyLabel
={t("setup.git.saving")} onRun={() => void snapshot.start()} primary={state === "failed"} />
      </>}
    >
      {body}
    </Step>
  );
}

// Once done, the step only runs the extension's workflow (e.g. the trace sync), like the git step;
// its configuration lives in Apps. Until then it shows the guided key form.
function ExtensionRun({ dag }: { dag: string }) {
  const { t } = useTranslation();
  const { backend } = useStore();
  const run = useDaguAction<unknown>(backend, dag, "result", { loadLast: true }) as Action<unknown>;
  const logs = useLogsUrl(dag);
  return (
    <>
      <span className="step-meta"><ActionStatus action={run} /></span>
      <External href={logs} className="step-link">{t("common.viewInDagu")} </External>
      <ActionButton action={run} label={t("ext.run")} busyLabel={t("ext.running")} onRun={() => void run.start()} />
    </>
  );
}

function ExtensionStep({ ext, state }: { ext: Extension; state: StepState }) {
  const { t, i18n } = useTranslation();
  const { check, reload } = useStore();
  const setup = ext.setup!;
  const title = localized(i18n.language, setup.title, setup.title_i18n);
  const description = setup.description ? localized(i18n.language, setup.description, setup.description_i18n) : undefined;
  const dag = state === "done" ? ext.workflows[0] : undefined;
  return (
    <Step
      state={state}
      title={title}
      side={dag ? <ExtensionRun dag={dag} /> : <span className="step-meta"><ActionStatus action={check} /></span>}
    >
      {description && <p className="step-detail">{description}</p>}
      {state === "failed" && <p role="alert" className="step-error">{t("setup.extension.failed")}</p>}
      {state !== "done" && <ExtensionSetup ext={ext} onSaved={() => { reload(); void check.start(); }} />}
    </Step>
  );
}

function McpCard() {
  const { t } = useTranslation();
  return (
    <section className="card as-setup" aria-labelledby="as-setup-t">
      <div className="grow">
        <h2 id="as-setup-t">{t("mcp.setupTitle")}</h2>
        <p className="mute">{t("mcp.setupBody")}</p>
      </div>
      <a href={href.mcp} className="btn btn-sm btn-soft">{t("mcp.setupLink")} <span aria-hidden="true">→</span></a>
    </section>
  );
}

export function Setup() {
  const { t } = useTranslation();
  const s = useStore();
  const p = s.project.data;
  const done = s.stepsDone;
  const TOTAL = s.stepsTotal;
  const allDone = done === TOTAL;
  const steps = (
    <ol className="steps card">
      <EnginesStep />
      <BotsStep />
      <DaguStep />
      <GitStep />
      {s.extSteps.map(({ ext, state }) => <ExtensionStep key={ext.id} ext={ext} state={state} />)}
    </ol>
  );

  if (allDone)
    return (
      <main className="page page-mid">
        <section aria-labelledby="ready-t" className="card hero">
          <span aria-hidden="true" className="hero-icon">✓</span>
          <div className="hero-body">
            <h1 id="ready-t" className="h1">{t("setup.readyTitle")}</h1>
            <p className="mute" style={{ marginTop: 2 }}>{t("setup.readyBody", { count: TOTAL })}</p>
          </div>
          {p && (
            <div className="hero-actions">
              {embedded(s, "dagu") ? <a href={href.app("dagu")} className="btn btn-lg btn-soft">{t("setup.openDagu")}</a>
                : <External href={p.urls.dagu} className="btn btn-lg btn-soft">{t("setup.openDagu")} </External>}
              {embedded(s, "omb") ? <a href={href.app("omb")} className="btn btn-lg btn-pri">{t("top.openOmb")}</a>
                : <External href={p.urls.omb} className="btn btn-lg btn-pri">{t("top.openOmb")} </External>}
            </div>
          )}
        </section>
        <section aria-labelledby="steps-t" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 id="steps-t" className="section-title">
            {t("setup.steps")} <span>{t("setup.stepsReady", { done, total: TOTAL })}</span>
          </h2>
          {steps}
        </section>
        <McpCard />
        <IdentityCard />
      </main>
    );

  return (
    <main className="page page-mid">
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h1 className="h1">{t("setup.title")}</h1>
          <GlobalState short className="only-mobile" />
        </div>
        {!s.noData && (
          <div className="progress">
            <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL} aria-valuenow={done} aria-label={t("setup.progressLabel")}>
              <div style={{ width: `${(done / TOTAL) * 100}%` }} />
            </div>
            <span className="mute only-desktop" style={{ fontSize: 13 }}>{t("setup.progress", { done, total: TOTAL })}</span>
            <span className="mute only-mobile" style={{ fontSize: 12 }}>{t("setup.progressShort", { done, total: TOTAL })}</span>
          </div>
        )}
      </div>
      {s.noData && (
        <section className="card hero" aria-labelledby="first-t" style={{ padding: "18px 20px" }}>
          <div className="hero-body">
            <h2 id="first-t" style={{ fontWeight: 700, fontSize: 16 }}>{t("setup.firstTitle")}</h2>
            <p className="mute" style={{ marginTop: 2 }}>{t("setup.firstBody")}</p>
          </div>
          <div className="hero-actions">
            <button type="button" className="btn btn-lg btn-pri" onClick={() => void s.check.start()}>{t("setup.verifyAll")}</button>
          </div>
        </section>
      )}
      {steps}
      <McpCard />
      <IdentityCard />
    </main>
  );
}
