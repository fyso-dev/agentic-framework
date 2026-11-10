// "Vista previa de cambios": run fyso-bots-plan with the draft, show OMB's plan lines
// verbatim, then fyso-bots-apply (snapshot → write → apply → commit, contract §3).
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { DAGS, type ApplyResult, type Plan } from "../api/types";
import { useLogsUrl } from "../components/Action";
import { IconCommit, Spinner } from "../components/Icons";
import { External, Modal } from "../components/ui";
import { base64Utf8 } from "../lib/team";
import { useDaguAction } from "../lib/useDaguAction";
import { useStore } from "../store";

/** Visual marker only, from OMB's verb; the line itself is shown as received. */
function marker(line: string): [string, string] {
  if (/:\s*create\b/i.test(line)) return ["+", "pill-ok"];
  if (/:\s*(delete|remove)\b/i.test(line)) return ["−", "pill-down"];
  if (/:\s*update\b/i.test(line)) return ["~", "pill-warn"];
  return ["·", "pill-unk"];
}

const warningText = (w: unknown) =>
  typeof w === "string" ? w : w && typeof w === "object" && "message" in w ? String((w as { message: unknown }).message) : JSON.stringify(w);

export function Preview({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useStore();
  const plan = useDaguAction<Plan>(s.backend, DAGS.botsPlan, "plan");
  const apply = useDaguAction<ApplyResult>(s.backend, DAGS.botsApply, "apply");
  const planLogs = useLogsUrl(plan.dag);
  const applyLogs = useLogsUrl(apply.dag);
  // Empty TEAM_B64 means "the current file" (contract §3).
  const teamB64 = useMemo(() => (s.draft ? base64Utf8(s.draft) : ""), [s.draft]);
  const applied = useRef(false);

  const runPlan = () => void plan.start({ TEAM_B64: teamB64 });
  useEffect(() => {
    if (!open || !s.draftReady) return;
    applied.current = false;
    apply.reset();
    runPlan();
    // Re-plan each time the dialog opens (only `open` matters here).
  }, [open, s.draftReady]); // eslint-disable-line react-hooks/exhaustive-deps



  useEffect(() => {
    if (apply.phase === "ok" && !applied.current) {
      applied.current = true;
      s.afterApply();
    }
  }, [apply.phase, s]);

  const applying = apply.phase === "running";
  const close = () => {
    if (!applying) onClose();
  };
  const p = plan.output;
  const total = p ? p.created + p.changed + p.deleted : 0;
  const counts = p
    ? ([["created", p.created], ["changed", p.changed], ["deleted", p.deleted]] as const).filter(([, n]) => n > 0)
    : [];

  if (apply.phase === "ok") {
    const r = apply.output;
    const parts = r
      ? ([["created", r.created], ["changed", r.changed], ["deleted", r.deleted]] as const)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => t(`preview.done_${k}`, { count: n }))
      : [];
    return (
      <Modal open={open} onClose={onClose} labelledBy="pv-done">
        <div role="status" className="center-block" style={{ gap: 12, padding: "36px 28px 28px" }}>
          <span aria-hidden="true" className="big-icon">✓</span>
          <h2 id="pv-done" style={{ fontWeight: 700, fontSize: 18 }}>{t("preview.doneTitle")}</h2>
          <p className="mute">
            {[parts.join(", "), t("preview.doneSnapshot")].filter(Boolean).join(" · ")}
            {r?.commit && <> · <span className="mono" style={{ fontSize: 12 }}>{r.commit}</span></>}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 6 }}>
            <button type="button" className="btn btn-lg btn-soft" onClick={onClose}>{t("common.close")}</button>
            {s.project.data && (
              <External href={s.project.data.urls.omb} className="btn btn-lg btn-pri">{t("top.openOmb")} </External>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  let body;
  if (plan.phase === "running" || plan.phase === "never")
    body = (
      <p role="status" className="center-block mute" style={{ flexDirection: "row", justifyContent: "center", padding: "28px 0" }}>
        <Spinner size={14} /> {t("preview.planning")}
      </p>
    );
  else if (plan.phase === "failed" || !p)
    body = (
      <div role="alert" className="action-error" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 14px" }}>
        <p style={{ fontWeight: 700, color: "var(--fy-down)" }}>× {t("preview.planFailed")}</p>
        {plan.error && <p className="mono" style={{ fontSize: 12 }}>{plan.error}</p>}
        <p><External href={planLogs}>{t("common.logs")} </External></p>
      </div>
    );
  else if (total === 0)
    body = (
      <div className="center-block">
        <span aria-hidden="true" className="plan-glyph pill-unk" style={{ width: 40, height: 40, borderRadius: "var(--fy-radius-pill)" }}>=</span>
        <p style={{ fontWeight: 700, fontSize: 16 }}>{t("preview.emptyTitle")}</p>
        <p className="mute">{t("preview.emptyBody")}</p>
      </div>
    );
  else
    body = (
      <>
        <p className="plan-sum">
          <strong>{t("preview.plan")}</strong> {counts.map(([k, n]) => t(`preview.${k}`, { count: n })).join(", ")}
          <span className="pill pill-ok" style={{ marginLeft: 6 }}>+ {p.created}</span>
          <span className="pill pill-warn">~ {p.changed}</span>
          <span className="pill pill-unk">− {p.deleted}</span>
        </p>
        <ul className="plan-list" aria-label={t("preview.linesLabel")} lang="en">
          {p.plan.map((line, i) => {
            const [g, cls] = marker(line);
            return (
              <li key={i}>
                <span aria-hidden="true" className={`plan-glyph ${cls}`}>{g}</span>
                <span className="plan-line">{line}</span>
              </li>
            );
          })}
        </ul>
        {p.warnings && p.warnings.length > 0 && (
          <div className="banner banner-warn" style={{ padding: "10px 12px", fontSize: 13 }}>
            <p><strong style={{ color: "var(--fy-warn)" }}>{t("preview.warnings")}</strong></p>
            <ul style={{ margin: 0, paddingLeft: 18 }} lang="en">
              {p.warnings.map((w, i) => <li key={i} className="mono" style={{ fontSize: 12 }}>{warningText(w)}</li>)}
            </ul>
          </div>
        )}
        <p className="callout"><IconCommit />{t("preview.snapshotNote")}</p>
      </>
    );

  const canApply = plan.phase === "ok" && total > 0 && !applying;
  return (
    <Modal open={open} onClose={close} labelledBy="pv-t">
      <div className="modal-head">
        <h2 id="pv-t">{t("preview.title")}</h2>
        <button type="button" className="icon-btn" aria-label={t("common.close")} onClick={close} disabled={applying}>✕</button>
      </div>
      <div className="modal-body">
        {body}
        {apply.phase === "failed" && (
          <div role="alert" className="action-error" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 14px" }}>
            <p style={{ fontWeight: 700, color: "var(--fy-down)" }}>× {t("preview.failedTitle")}</p>
            {apply.error && <p style={{ fontSize: 13 }} lang="en">{apply.error}</p>}
            <p><External href={applyLogs}>{t("common.logs")} </External></p>
          </div>
        )}
      </div>
      <div className="modal-foot">
        {applying ? (
          <span role="status" className="grow mute" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <Spinner size={14} />
            {t("preview.runningNote")}
          </span>
        ) : (
          <span className="grow" />
        )}
        <button type="button" className="btn btn-soft" onClick={close} disabled={applying}>{t("common.cancel")}</button>
        {plan.phase === "failed" ? (
          <button type="button" className="btn btn-pri" onClick={runPlan}>{t("common.retry")}</button>
        ) : (
          <button
            type="button"
            className="btn btn-pri"
            disabled={!canApply}
            aria-busy={applying}
            onClick={() => void apply.start({ TEAM_B64: teamB64 })}
          >
            {applying ? t("preview.applying") : apply.phase === "failed" ? t("common.retry") : t("preview.apply")}
          </button>
        )}
      </div>
    </Modal>
  );
}
