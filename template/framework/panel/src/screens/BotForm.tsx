// Bot form: edits one bot of the draft team.yaml (name, role, model, base
// instructions, "uses workflows"). Saving does not apply; it leaves the change pending.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Engine } from "../api/types";
import { Avatar, Modal, Switch } from "../components/ui";
import { go, href } from "../lib/router";
import {
  byteLength, NAME_MAX, parseTeam, removeBot, serializeTeam,
 SOUL_MAX_BYTES, SOUL_WARN_BYTES, soulFileLabel, upsertBot, type Bot,
} from "../lib/team";
import { useStore } from "../store";
import { BotStatePill } from "./Bots";

type Errors = { name?: string; soul?: string; model?: string };

/** Engines from the last check; without one, the engines the team file already uses. */
function useEngines(bots: Bot[]): { list: Engine[]; checked: boolean } {
  const { checkData } = useStore();
  return useMemo(() => {
    if (checkData) return { list: checkData.engines, checked: true };
    const map = new Map<string, Set<string>>();
    for (const b of bots) if (b.engine) map.set(b.engine, (map.get(b.engine) ?? new Set()).add(b.modelId));
    return {
      checked: false,
      list: [...map].map(([id, models]) => ({ id, label: id, kind: "subscription" as const, ok: true, models: [...models] })),
    };
  }, [checkData, bots]);
}

export function BotForm({ index }: { index: number | null }) {
  const s = useStore();
  const { t } = useTranslation();
  if (s.team.status !== "ok") return <main className="page page-narrow"><p className="mute">{t("common.loading")}</p></main>;
  const bot = index === null ? null : s.workingBots.find((b) => b.index === index) ?? null;
  if (index !== null && !bot) return <NotFound />;
  return <Form key={index ?? "new"} bot={bot} />;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="page page-narrow">
      <p style={{ fontSize: 13 }}><a href={href.bots} style={{ textDecoration: "none" }}>← {t("form.back")}</a></p>
      <div className="card empty"><p>{t("form.notFound")}</p></div>
    </main>
  );
}

function Form({ bot }: { bot: Bot | null }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const id = useId();
  const engines = useEngines(s.workingBots);
  const row = bot ? s.rows.find((r) => r.bot.index === bot.index && r.state !== "deleted") : undefined;
  const base = bot ? s.baseBots.find((b) => b.name === bot.name) : undefined;
  const firstOk = engines.list.find((e) => e.ok) ?? engines.list[0];

  const [name, setName] = useState(bot?.name ?? "");
  const [title, setTitle] = useState(bot?.title ?? "");
  const [engine, setEngine] = useState(bot?.engine || firstOk?.id || "");
  const [model, setModel] = useState(bot?.modelId || firstOk?.models[0] || "");
  const initialSoul = bot?.soul.kind === "inline" ? bot.soul.text : "";
  const [soul, setSoul] = useState(initialSoul);
  const [uses, setUses] = useState(bot ? bot.usesWorkflows : true);
  const [errors, setErrors] = useState<Errors>({});
  const [showSummary, setShowSummary] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  // On phones the form has its own header and a fixed footer (board 11).
  useEffect(() => {
    document.body.classList.add("with-form-foot");
    return () => document.body.classList.remove("with-form-foot");
  }, []);

  const current = engines.list.find((e) => e.id === engine);
  const models = useMemo(() => {
    const list = current?.models ?? [];
    return model && !list.includes(model) ? [model, ...list] : list;
  }, [current, model]);
  const bytes = byteLength(soul);
  const num = new Intl.NumberFormat(i18n.language);

  const nameError = (v: string): string | undefined => {
    const n = v.trim();
    if (!n) return t("form.errNameRequired");
    if (n.length > NAME_MAX) return t("form.errNameLong", { max: NAME_MAX });
    if (s.workingBots.some((b) => b.name === n && b.index !== bot?.index) || (n === "MausBot" && !bot)) return t("form.errNameDup");
    return undefined;
  };
  const soulError = (len: number) =>
    len > SOUL_MAX_BYTES ? t("form.errSoulLong", { extra: num.format(len - SOUL_MAX_BYTES) }) : undefined;

  const pickEngine = (e: Engine) => {
    setEngine(e.id);
    if (!e.models.includes(model)) setModel(e.models[0] ?? "");
  };

  const save = () => {
    const next: Errors = { name: nameError(name), soul: soulError(bytes), model: model ? undefined : t("form.errModel") };
    setErrors(next);
    const count = Object.values(next).filter(Boolean).length;
    if (count > 0) {
      setShowSummary(true);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    const doc = parseTeam(s.workingText ?? "version: 1\nbots: []\n");
    const soulChanged = bot?.soul.kind === "file" ? soul.trim() !== "" : soul !== initialSoul;
    upsertBot(doc, bot?.index ?? null, {
      name,
      title,
      model: engine ? `${engine}/${model}` : model,
      soulText: soulChanged ? soul : null,
      usesWorkflows: uses,
    });
    s.setDraft(serializeTeam(doc));
    go(href.bots);
  };

  const remove = () => {
    if (!bot) return;
    const doc = parseTeam(s.workingText!);
    removeBot(doc, bot.index);
    s.setDraft(serializeTeam(doc));
    go(href.bots);
  };

  const errorCount = Object.values(errors).filter(Boolean).length;
  const heading = bot ? bot.name : t("form.newTitle");
  const bad = engines.list.find((e) => !e.ok);

  return (
    <main className="page page-narrow" style={{ gap: 14 }}>
      <div className="mobile-head">
        <a href={href.bots} aria-label={t("form.backAria")}>←</a>
        <h1 className="ellipsis">{heading}</h1>
        {bot && <button type="button" className="btn btn-text-danger" style={{ height: 36 }} onClick={() => setConfirmDelete(true)}>{t("form.deleteShort")}</button>}
      </div>
      <p className="desktop-head" style={{ padding: "0 4px", fontSize: 13 }}>
        <a href={href.bots} style={{ textDecoration: "none" }}>← {t("form.back")}</a>
      </p>
      <div className="desktop-head" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 4px" }}>
        <Avatar name={bot ? bot.name : name || "+"} large />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 className="h1 ellipsis">{heading}</h1>
          {row && row.state !== "applied" && <BotStatePill state={row.state} />}
        </div>
      </div>

      <form className="form card" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        {showSummary && errorCount > 0 && (
          <p ref={summaryRef} tabIndex={-1} role="alert" className="banner banner-down" style={{ margin: "20px 20px 0", color: "var(--down)", fontWeight: 700 }}>
            × {t("form.errors", { count: errorCount })}
          </p>
        )}
        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor={`${id}-name`}>{t("form.name")}</label>
            <input
              id={`${id}-name`}
              className="input"
              value={name}
              maxLength={NAME_MAX + 20}
              autoComplete="off"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? `${id}-name-err` : undefined}
              onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: nameError(e.target.value) }); }}
              onBlur={() => setErrors({ ...errors, name: nameError(name) })}
            />
            {errors.name && <p id={`${id}-name-err`} className="field-err">× {errors.name}</p>}
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-role`}>{t("form.role")} <span>· {t("form.roleHint")}</span></label>
            <input id={`${id}-role`} className="input" value={title} autoComplete="off" onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))} />
          </div>
        </div>

        <fieldset className="form-sec">
          <legend>{t("form.engine")}</legend>
          <div className="engines" role="radiogroup" aria-label={t("form.engine")}>
            {engines.list.map((e) => {
              const on = e.id === engine;
              return (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className="engine"
                  disabled={!e.ok && !on}
                  onClick={() => pickEngine(e)}
                >
                  <span>
                    <strong>{e.label}</strong>
                    <span className="sub" style={{ display: "block" }}>
                      {!e.ok ? t("form.unauth") : engines.checked ? t(`bots.kind.${e.kind}`) : t("form.unchecked")}
                    </span>
                  </span>
                  <span aria-hidden="true" className="radio-dot">{on ? "●" : "○"}</span>
                </button>
              );
            })}
          </div>
          <p className="hint">
            {engines.checked ? t("form.engineHint") : t("form.enginesUnchecked")}{" "}
            {bad && <a href={href.setup}>{t("form.authEngine", { label: bad.label })}</a>}
            {!engines.checked && <a href={href.setup}>{t("form.verifyEngines")}</a>}
          </p>
        </fieldset>

        <div className="form-sec">
          <label className="label" htmlFor={`${id}-model`}>{t("form.model")}</label>
          <select id={`${id}-model`} className="select mono" value={model} onChange={(e) => setModel(e.target.value)} aria-invalid={!!errors.model}>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          {errors.model && <p className="field-err">× {errors.model}</p>}
          {base && base.model !== `${engine}/${model}` && (
            <p className="hint">{t("form.before")} <span className="mono">{base.modelId}</span></p>
          )}
        </div>

        <div className="form-sec">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <label className="label" htmlFor={`${id}-soul`}>{t("form.instructions")} <span>· Markdown</span></label>
            <span id={`${id}-count`} className={`counter${bytes > SOUL_MAX_BYTES ? " over" : bytes >= SOUL_WARN_BYTES ? " warn" : ""}`}>
              {t("form.bytes", { used: num.format(bytes), max: num.format(SOUL_MAX_BYTES) })}
            </span>
          </div>
          {bot?.soul.kind === "file" && (
            <p className="soul-file">
              <span>
{t("form.soulFile")} <code>{soulFileLabel(bot.soul.file)}</code></span>
            </p>
          )}
          <textarea
            id={`${id}-soul`}
            className="textarea"
            rows={9}
            value={soul}
            placeholder={bot?.soul.kind === "file" ? t("form.soulFilePlaceholder") : undefined}
            aria-invalid={!!errors.soul || bytes > SOUL_MAX_BYTES}
            aria-describedby={`${id}-soul-help ${id}-count`}
            onChange={(e) => { setSoul(e.target.value); setErrors((x) => ({ ...x, soul: soulError(byteLength(e.target.value)) })); }}
          />
          {errors.soul ? (
            <p id={`${id}-soul-help`} className="field-err">× {errors.soul}</p>
          ) : (
            <p id={`${id}-soul-help`} className="hint">{t("form.instructionsHint")}</p>
          )}
        </div>

        <div className="form-sec" style={{ gap: 2 }}>
          <p className="label" style={{ marginBottom: 6 }}>{t("form.skills")}</p>
          {(bot?.skills ?? []).length === 0 ? (
            <p className="hint" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}>{t("form.skillsNone")}</p>
          ) : (
            <>
              {bot!.skills.map((k) => (
                <div key={k} className="toggle-row">
                  <p className="grow mono" style={{ fontSize: 13, fontWeight: 600 }}>{k}</p>
                  <Switch checked label={k} disabled describedBy={`${id}-skills-ro`} />
                </div>
              ))}
              <p id={`${id}-skills-ro`} className="hint" style={{ paddingTop: 6 }}>{t("form.skillsReadOnly")}</p>
            </>
          )}
        </div>

        <div className="toggle-box">
          <div className="grow">
            <p style={{ fontWeight: 700 }}>{t("form.workflows")}</p>
            <p id={`${id}-wf`} className="hint">{bot?.usesWorkflows ? t("form.workflowsLocked") : t("form.workflowsHint")}</p>
          </div>
          <Switch checked={uses} onChange={setUses} label={t("form.workflows")} disabled={bot?.usesWorkflows} describedBy={`${id}-wf`} />
        </div>

        <div className="form-foot">
          {bot && <button type="button" className="btn btn-md btn-text-danger" onClick={() => setConfirmDelete(true)}>{t("form.delete")}</button>}
          <span className="note">{t("form.saveNote")}</span>
          <a href={href.bots} className="btn btn-md btn-ghost">{t("common.cancel")}</a>
          <button type="submit" className="btn btn-md btn-pri" style={{ padding: "0 18px" }}>{t("form.save")}</button>
        </div>
      </form>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} labelledBy="del-t" className="small" role="alertdialog">
        <div className="modal-head"><h2 id="del-t">{t("form.deleteTitle", { name: bot?.name ?? "" })}</h2></div>
        <div className="modal-body"><p className="mute">{t("form.deleteBody")}</p></div>
        <div className="modal-foot" style={{ justifyContent: "flex-end", borderTop: 0, paddingTop: 0 }}>
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-danger" onClick={remove}>{t("form.delete")}</button>
        </div>
      </Modal>
    </main>
  );
}
