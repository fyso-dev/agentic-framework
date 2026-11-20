// The action component (panel-spec "How actions behave"): status on the left, button on
// the right, error + "See logs in Dagu" + "Retry" below when it fails. Five states:
// never · idle · running · ok · failed, driven by a Dagu run (lib/useDaguAction).
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Action } from "../lib/useDaguAction";
import { useCapability } from "../lib/access";
import { useTimeFormat } from "../lib/time";
import { useStore } from "../store";
import { Spinner } from "./Icons";
import { External, RelTime } from "./ui";

export function useLogsUrl(dag: string): string {
  const { project } = useStore();
  const base = (project.data?.urls.dagu ?? "").replace(/\/$/, "");
  return `${base}/dags/${encodeURIComponent(dag)}`;
}

function useElapsed(since: number | undefined, active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return since ? Math.max(0, (now - since) / 1000) : 0;
}

type AnyAction = Action<unknown>;

/** The status text of an action, for every state. */
export function ActionStatus({ action }: { action: AnyAction }) {
  const { t } = useTranslation();
  const f = useTimeFormat();
  const running = action.phase === "running";
  const elapsed = useElapsed(action.since, running);
  const finished = action.run?.finishedAt;
  switch (action.phase) {
    case "loading":
      return <span className="action-status">{t("common.loading")}</span>;
    case "never":
      return (
        <span className="action-status">
          <span aria-hidden="true" className="glyph">–</span>
          {t("action.never")}
        </span>
      );
    case "running":
      return (
        <span className="action-status is-running" role="status">
          <Spinner />
          {t("action.running", { elapsed: f.seconds(elapsed) })}
        </span>
      );
    case "ok":
      return (
        <span className="action-status is-ok" role="status">
          <span aria-hidden="true" className="glyph">✓</span>
          <RelTime at={finished ?? Date.now()} prefix={(rel) => t("action.ok", { when: rel })} />
        </span>
      );
    case "failed":
      return (
        <span className="action-status is-failed">
          <span aria-hidden="true" className="glyph">×</span>
          {finished ? <RelTime at={finished} prefix={(rel) => t("action.failedAt", { when: rel })} /> : t("action.failed")}
        </span>
      );
    default:
      return (
        <span className="action-status">
          <RelTime at={finished} />
        </span>
      );
  }
}

/** The action's button: primary when it never ran or failed, disabled while running. */
export function ActionButton({ action, label, busyLabel, onRun, primary, size = "sm", className = "" }: {
  action: AnyAction;
  label: ReactNode;
  busyLabel: string;
  onRun: () => void;
  primary?: boolean;
  /** "sm" inside step/action rows (default), "md" for page-level buttons. */
  size?: "sm" | "md";
  className?: string;
}) {
  const { t } = useTranslation();
  const running = action.phase === "running";
  const failed = action.phase === "failed";
  const pri = primary ?? (action.phase === "never" || failed);
  const canRun = useCapability(`workflow:${action.dag}:run`);
  if (!canRun) return null;
  return (
    <button
      type="button"
      className={`btn${size === "sm" ? " btn-sm" : ""} ${pri ? "btn-pri" : "btn-soft"} ${className}`}
      disabled={running || action.phase === "loading"}
      aria-busy={running}
      onClick={onRun}
    >
      {running ? busyLabel : failed ? t("common.retry") : label}
    </button>
  );
}

/** Short error (verbatim from Dagu) + link to the logs. */
export function ActionError({ action, children }: { action: AnyAction; children?: ReactNode }) {
  const { t } = useTranslation();
  const logs = useLogsUrl(action.dag);
  const canOpenLogs = useCapability("app:dagu");
  if (action.phase !== "failed") return null;
  return (
    <p role="alert" className="action-error">
      <strong>{children ?? action.error ?? t("action.failedGeneric")}</strong>
      {canOpenLogs && <External href={logs}>{t("common.logs")} </External>}
    </p>
  );
}

/** Standalone action (board 12): title, status, button, and the error box when it fails. */
export function ActionCard({ title, action, label, busyLabel, onRun }: {
  title: string;
  action: AnyAction;
  label: string;
  busyLabel: string;
  onRun: () => void;
}) {
  return (
    <div className="card action">
      <div className="action-head">
        <p className="grow" style={{ fontWeight: 700 }}>{title}</p>
        <ActionStatus action={action} />
        <ActionButton action={action} label={label} busyLabel={busyLabel} onRun={onRun} />
      </div>
      <ActionError action={action} />
    </div>
  );
}
