// Bot detail (B1.3): one bot in three tabs — Perfil, Instrucciones, Conectores —
// and one Save for everything. team.yaml fields go to the local draft (applied later
// with "Revisar y aplicar"); app grants are planned and applied by fyso-app-access.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Engine, RuntimeBot } from "../api/types";
import type { Observation } from "../api/observability";
import { BotAccess, useAppAccess, useMcpInventory, type Level } from "../components/BotAccess";
import {
  IconAlert, IconArrowUpRight, IconBack, IconBolt, IconBulb, IconChat, IconCommit, IconDoc, IconHand, IconLayers,
  IconPerson, IconPlay, IconPlug, IconShield, IconSparkle, IconTrash, IconTrend, IconUndo, IconWrench, Spinner,
} from "../components/Icons";
import { Avatar, Modal, Switch } from "../components/ui";
import { botActivity } from "../lib/bot-activity";
import { accessFor, ensurePiHumanRequestOrigin, piHumanRequestOriginBlocked, selectServer, type ToolScope } from "../lib/connector-access";
import { go, href, type BotTab } from "../lib/router";
import {
  byteLength, extensionSkillFile, thirdPartySkillFile, NAME_MAX, parseTeam, readBots, removeBot, serializeTeam,
  SOUL_MAX_BYTES, SOUL_WARN_BYTES, soulFileLabel, teamNames, invalidTeamRemoval, appliedTeamForRemoval, upsertBot, type Approval, type Bot,
} from "../lib/team";
import { useStore } from "../store";
import { BotStatePill } from "./Bots";

type Errors = { name?: string; soul?: string; model?: string; team?: string };

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

const SECTIONS = ["role", "rules", "tone", "examples"] as const;

export function BotDetail({ bot, tab, runtime, observation }: { bot: Bot | null; tab?: BotTab; runtime?: RuntimeBot; observation?: Observation }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const id = useId();
  const engines = useEngines(s.workingBots);
  const row = bot ? s.rows.find((r) => r.bot.index === bot.index && r.state !== "deleted") : undefined;
  const firstOk = engines.list.find((e) => e.ok) ?? engines.list[0];
  const omb = s.project.data?.urls.omb;

  const initial = useMemo(() => ({
    name: bot?.name ?? "",
    title: bot?.title ?? "",
    team: bot?.team ?? "",
    engine: bot?.engine || firstOk?.id || "",
    model: bot?.modelId || firstOk?.models[0] || "",
    approval: (bot?.approval ?? "ask") as Approval,
    soul: bot?.soul.kind === "inline" ? bot.soul.text : "",
    uses: bot ? bot.usesWorkflows : true,
  }), [bot?.fingerprint, firstOk?.id]);

  const [current, setTab] = useState<BotTab>(tab ?? "perfil");
  useEffect(() => { if (tab) setTab(tab); }, [tab]);
  const pickTab = (next: BotTab) => {
    setTab(next);
    history.replaceState(null, "", runtime?.id ? href.nativeBot(runtime.id, next) : href.botTab(bot?.index ?? null, next));
  };

  const [name, setName] = useState(initial.name);
  const [title, setTitle] = useState(initial.title);
  const [team, setTeam] = useState(initial.team);
  const appliedTeam = appliedTeamForRemoval(bot, s.runtimeBots.status === 'ok' ? s.runtimeBots.data ?? [] : null, s.baseBots);
  // Teams the file declares or already uses (D81); a new name creates the team on apply.
  const teams = useMemo(() => { try { return teamNames(parseTeam(s.workingText ?? "version: 1\n")); } catch { return []; } }, [s.workingText]);
  const [engine, setEngine] = useState(initial.engine);
  const [model, setModel] = useState(initial.model);
  const [approval, setApproval] = useState<Approval>(initial.approval);
  const [soul, setSoul] = useState(initial.soul);
  const [uses, setUses] = useState(initial.uses);
  // Skills shipped by installed extensions (D54) and third-party skills a person confirmed
  // (D73) are switched per bot; other skills of the team file stay read-only. An extension
  // skill needs the project's MCP servers, which a bot only loads from the project root.
  const extSkills = useMemo(
    () => [
      ...(s.extensions.data ?? []).flatMap((e) => e.skills.map((k) => ({ from: t("form.skillFrom", { ext: e.id }), ext: e.id as string | null, name: k, file: extensionSkillFile(e.id, k), servers: e.mcpServers, needsRoot: true, ready: true }))),
      ...(s.skills.data ?? []).map((k) => ({ from: t("form.skillThirdParty", { src: k.src }), ext: null as string | null, name: k.name, file: thirdPartySkillFile(k.name), servers: [] as string[], needsRoot: false, ready: k.state === "ready" })),
    ],
    [s.extensions.data, s.skills.data, t],
  );
  const [skillsOn, setSkillsOn] = useState<Record<string, boolean>>({});
  const hasSkill = (file: string) => !!bot?.skillFiles.includes(file);
  const skillOn = (file: string) => skillsOn[file] ?? hasSkill(file);
  const skillsChanged = extSkills.some((k) => skillOn(k.file) !== hasSkill(k.file));
  const [scope, setScope] = useState<ToolScope | undefined>(runtime?.toolScope ?? bot?.tools);
  const [scopeChanged, setScopeChanged] = useState(false);
  const [appChanges, setAppChanges] = useState<Record<string, Level>>({});
  useEffect(() => { if (!scopeChanged && !s.draft) setScope(runtime ? runtime.toolScope : bot?.tools); }, [runtime, scopeChanged, s.draft, bot?.tools]);
  // A skill is useless without its extension's tools. For a bot with a tool allow-list,
  // switching it on also selects the extension's MCP servers and switching it off drops
  // that whole-server selection. Connectors shows the result and refines it.
  const toggleSkill = (k: (typeof extSkills)[number], on: boolean) => {
    setSkillsOn((prev) => ({ ...prev, [k.file]: on }));
    let next = scope;
    for (const name of k.servers) {
      if (on && accessFor(next, name) === "none") next = selectServer(next, name, true);
      else if (!on && next?.allow?.includes(`mcp:${name}:*`)) next = { ...next, allow: next.allow.filter((x) => x !== `mcp:${name}:*`) };
    }
    if (on && engine === "pi" && k.ext === "human-requests" && k.name === "human-requests") next = ensurePiHumanRequestOrigin(next);
    if (next !== scope) { setScope(next); setScopeChanged(true); }
  };
  const piHumanRequestSelected = uses && extSkills.some((k) => k.ext === "human-requests" && k.name === "human-requests" && skillOn(k.file));
  const pickUses = (value: boolean) => {
    setUses(value);
    if (value && engine === "pi" && extSkills.some((k) => k.ext === "human-requests" && k.name === "human-requests" && skillOn(k.file))) {
      const next = ensurePiHumanRequestOrigin(scope); if (next !== scope) { setScope(next); setScopeChanged(true); }
    }
  };

  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const soulRef = useRef<HTMLTextAreaElement>(null);

  const mcp = useMcpInventory(scope, runtime, uses);
  const apps = useAppAccess(runtime?.id);

  const currentEngine = engines.list.find((e) => e.id === engine);
  const models = useMemo(() => {
    const list = currentEngine?.models ?? [];
    return model && !list.includes(model) ? [model, ...list] : list;
  }, [currentEngine, model]);
  const bytes = byteLength(soul);
  const num = new Intl.NumberFormat(i18n.language);

  const teamDirty = !bot || name !== initial.name || title !== initial.title || team.trim() !== initial.team || engine !== initial.engine || model !== initial.model
    || approval !== initial.approval || soul !== initial.soul || uses !== initial.uses || scopeChanged || skillsChanged;
  const appsDirty = Object.keys(appChanges).length > 0;
  const dirty = teamDirty || appsDirty;

  const nameError = (v: string): string | undefined => {
    const n = v.trim();
    if (!n) return t("form.errNameRequired");
    if (n.length > NAME_MAX) return t("form.errNameLong", { max: NAME_MAX });
    if (s.workingBots.some((b) => b.name === n && b.index !== bot?.index) || (n === "MausBot" && !bot)) return t("form.errNameDup");
    return undefined;
  };
  const soulError = (len: number) => (len > SOUL_MAX_BYTES ? t("form.errSoulLong", { extra: num.format(len - SOUL_MAX_BYTES) }) : undefined);

  const pickEngine = (e: Engine) => {
    setEngine(e.id);
    if (e.id === "pi" && piHumanRequestSelected) {
      const next = ensurePiHumanRequestOrigin(scope); if (next !== scope) { setScope(next); setScopeChanged(true); }
    }
    if (!e.models.includes(model)) setModel(e.models[0] ?? "");
  };

  const discard = () => {
    setName(initial.name); setTitle(initial.title); setTeam(initial.team); setEngine(initial.engine); setModel(initial.model);
    setApproval(initial.approval); setSoul(initial.soul); setUses(initial.uses);
    setScope(runtime ? runtime.toolScope : bot?.tools); setScopeChanged(false); setAppChanges({}); setSkillsOn({});
    setErrors({}); setSaveFailed(false);
  };

  const save = async () => {
    const next: Errors = { name: nameError(name), soul: soulError(bytes), model: model ? undefined : t("form.errModel"), team: invalidTeamRemoval(appliedTeam, team) ? t("form.teamLeave") : undefined };
    setErrors(next);
    if (next.name || next.model || next.team) { pickTab("perfil"); return; }
    if (next.soul) { pickTab("instrucciones"); requestAnimationFrame(() => soulRef.current?.focus()); return; }
    setSaving(true); setSaveFailed(false);
    let index = bot?.index ?? null;
    if (teamDirty) {
      const doc = parseTeam(s.workingText ?? "version: 1\nbots: []\n");
      const soulChanged = bot?.soul.kind === "file" ? soul.trim() !== "" : soul !== initial.soul;
      const previousName = index === null ? undefined : doc.getIn(["bots", index, "was"]);
      const declaredName = s.baseBots.find((entry) => entry.name === bot?.name)?.name
        ?? s.baseBots.find((entry) => entry.name === previousName)?.name;
      upsertBot(doc, index, {
        name, title, approval, team,
        model: engine ? `${engine}/${model}` : model,
        soulText: soulChanged ? soul : null,
        usesWorkflows: uses,
        ...(scopeChanged ? { tools: scope || {} } : {}),
        skills: extSkills.map((k) => ({ file: k.file, on: (uses || !k.needsRoot) && skillOn(k.file) })),
      }, declaredName);
      if (index === null) index = readBots(doc).find((b) => b.name === name.trim())?.index ?? null;
      s.setDraft(serializeTeam(doc));
      setScopeChanged(false); setSkillsOn({});
    }
    if (appsDirty) {
      const ok = await apps.save(appChanges);
      if (ok) setAppChanges({}); else setSaveFailed(true);
    }
    setSaving(false);
    if (!bot && index !== null) go(href.botTab(index, current));
  };

  const remove = () => {
    if (!bot) return;
    const doc = parseTeam(s.workingText!);
    removeBot(doc, bot.index);
    s.setDraft(serializeTeam(doc));
    go(href.bots);
  };

  const insertSection = (key: (typeof SECTIONS)[number]) => {
    const heading = `## ${t(`detail.section.${key}`)}\n`;
    const el = soulRef.current;
    const at = el ? el.selectionStart : soul.length;
    const before = soul.slice(0, at), after = soul.slice(at);
    const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const text = before + lead + heading + after;
    setSoul(text);
    setErrors((x) => ({ ...x, soul: soulError(byteLength(text)) }));
    requestAnimationFrame(() => { if (el) { const pos = (before + lead + heading).length; el.focus(); el.setSelectionRange(pos, pos); } });
  };

  const activity = bot && observation ? botActivity(observation, { name: bot.name, id: runtime?.id }) : undefined;
  const money = (v: number | null) => v === null ? "—" : new Intl.NumberFormat(i18n.language, { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v);
  const stat = (v: number | undefined) => v === undefined ? "—" : num.format(v);
  const windowTip = activity ? t("detail.activity.window", { from: activity.from, to: activity.to }) : t("detail.activity.none");

  const connCount = (uses ? 1 : 0)
    + mcp.rows.filter((r) => accessFor(scope, r.name) !== "none").length
    + apps.slugs.filter((slug) => (appChanges[slug] ?? apps.level(slug)) !== "off").length;
  const heading = bot ? bot.name : name.trim() || t("form.newTitle");
  const commit = s.botVersioning.data?.commit;
  const soulOver = bytes > SOUL_MAX_BYTES, soulWarn = bytes >= SOUL_WARN_BYTES;

  return (
    <section className="card bd" aria-labelledby={`${id}-h`}>
      <div className="bd-hero">
        <a href={href.bots} className="bd-ib bd-back" aria-label={t("form.backAria")}><IconBack size={18} /></a>
        <span className="bd-ava" aria-hidden="true"><Avatar name={bot ? bot.name : name || "+"} omb={omb} appearance={runtime} large /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bd-title">
            <h2 id={`${id}-h`} className="ellipsis">{heading}</h2>
            {row && row.state !== "applied" && <BotStatePill state={row.state} />}
          </div>
          {(bot?.title || title) && <p className="mute ellipsis">{title || bot?.title}</p>}
        </div>
        <div className="bd-toolbar">
          {omb && <a href={omb} target="_blank" rel="noopener noreferrer" className="bd-ib" aria-label={t("detail.chat")} data-tip={t("detail.chat")}><IconChat size={18} /></a>}
          {bot && omb && <span className="bd-sep" aria-hidden="true" />}
          {bot && <button type="button" className="bd-ib danger tip-r" aria-label={t("form.delete")} data-tip={t("form.delete")} onClick={() => setConfirmDelete(true)}><IconTrash size={18} /></button>}
        </div>
      </div>

      <div className="bd-tabs" role="tablist" aria-label={t("detail.tabs")}>
        {([["perfil", IconPerson], ["instrucciones", IconDoc], ["conectores", IconPlug]] as const).map(([key, Icon]) => (
          <button key={key} type="button" role="tab" id={`${id}-tab-${key}`} aria-controls={`${id}-panel`} aria-selected={current === key} onClick={() => pickTab(key)}>
            <Icon size={16} />{t(`detail.tab.${key}`)}
            {key === "conectores" && <span className="bd-cnt">{connCount}</span>}
            {key === "perfil" && (errors.name || errors.model || errors.team) && <span className="bd-errdot" aria-label={t("detail.hasErrors")} />}
            {key === "instrucciones" && (errors.soul || soulOver) && <span className="bd-errdot" aria-label={t("detail.hasErrors")} />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${current}`}>
        {current === "perfil" && (
          <div className="bd-panel">
            <div className="bd-ident">
              <div className="field">
                <label className="label" htmlFor={`${id}-name`}>{t("form.name")}</label>
                <input id={`${id}-name`} className="input" value={name} maxLength={NAME_MAX + 20} autoComplete="off"
                  aria-invalid={!!errors.name} aria-describedby={errors.name ? `${id}-name-err` : undefined}
                  onChange={(e) => { setName(e.target.value); if (errors.name) setErrors({ ...errors, name: nameError(e.target.value) }); }}
                  onBlur={() => setErrors({ ...errors, name: nameError(name) })} />
                {errors.name && <p id={`${id}-name-err`} className="field-err">× {errors.name}</p>}
              </div>
              <div className="field">
                <label className="label" htmlFor={`${id}-role`}>{t("form.role")}</label>
                <input id={`${id}-role`} className="input" value={title} autoComplete="off" onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))} />
              </div>
              <div className="field">
                <label className="label" htmlFor={`${id}-team`}>{t("form.team")}</label>
                <input id={`${id}-team`} className="input" value={team} maxLength={60} autoComplete="off" list={`${id}-teams`}
                  placeholder={t("bots.team.none")} aria-invalid={!!errors.team} aria-describedby={`${id}-team-hint`} onChange={(e) => { setTeam(e.target.value.replace(/\n/g, " ")); setErrors((current) => ({ ...current, team: undefined })); }} />
                <datalist id={`${id}-teams`}>{teams.map((n) => <option key={n} value={n} />)}</datalist>
                <p id={`${id}-team-hint`} className={errors.team ? "field-err" : "hint"}>{t(invalidTeamRemoval(appliedTeam, team) ? "form.teamLeave" : bot?.chief ? "form.teamChief" : "form.teamHint")}</p>
              </div>
            </div>

            {bot && (
              <>
                <div className="bd-stats-head">
                  <span className="bd-cap" data-tip={windowTip} tabIndex={0}>{t("detail.activity.title")}</span>
                  <a href={href.observability} className="bd-link">{t("detail.activity.more")}<IconArrowUpRight size={14} /></a>
                </div>
                <div className="bd-stats">
                  <div className="bd-stat" data-tip={t("detail.activity.conversations")} tabIndex={0}><span className="bd-chip"><IconChat size={16} /></span><b>{stat(activity?.conversations)}</b><span className="sr-only">{t("detail.activity.conversations")}</span></div>
                  <div className="bd-stat" data-tip={t("detail.activity.tools")} tabIndex={0}><span className="bd-chip"><IconWrench size={16} /></span><b>{stat(activity?.tools)}</b><span className="sr-only">{t("detail.activity.tools")}</span></div>
                  <div className="bd-stat" data-tip={t("detail.activity.failed")} tabIndex={0}><span className={`bd-chip${activity?.failed ? " down" : ""}`}><IconAlert size={16} /></span><b>{stat(activity?.failed)}</b><span className="sr-only">{t("detail.activity.failed")}</span></div>
                  <div className="bd-stat tip-r" data-tip={t("detail.activity.cost")} tabIndex={0}><span className="bd-chip"><IconTrend size={16} /></span><b>{activity ? money(activity.usd) : "—"}</b><span className="sr-only">{t("detail.activity.cost")}</span></div>
                </div>
              </>
            )}

            <div className="bd-settings">
              <div className="bd-set">
                <span className="bd-chip" data-tip={t("detail.thinksWith")} tabIndex={0} aria-label={t("detail.thinksWith")}><IconSparkle size={16} /></span>
                <select className="bd-sel" aria-label={t("form.engine")} value={engine} onChange={(e) => { const next = engines.list.find((x) => x.id === e.target.value); if (next) pickEngine(next); }}>
                  {engines.list.map((e) => <option key={e.id} value={e.id} disabled={!e.ok && e.id !== engine}>{e.label}{e.ok ? "" : ` · ${t("form.unauth")}`}</option>)}
                </select>
                <select className="bd-sel mono" aria-label={t("form.model")} value={model} aria-invalid={!!errors.model} onChange={(e) => setModel(e.target.value)} style={{ flex: "1 1 auto" }}>
                  {models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                {!engines.checked && <a href={href.setup} className="bd-ib warn" aria-label={t("form.verifyEngines")} data-tip={t("form.enginesUnchecked")}><IconAlert size={16} /></a>}
              </div>
              <div className="bd-set">
                <span className="bd-chip" data-tip={t("detail.autonomy")} tabIndex={0} aria-label={t("detail.autonomy")}><IconShield size={16} /></span>
                <div className="bd-seg" role="group" aria-label={t("detail.autonomy")}>
                  <button type="button" aria-pressed={approval === "ask"} onClick={() => setApproval("ask")} data-tip={t("detail.approval.askTip")}><IconHand size={16} />{t("detail.approval.ask")}</button>
                  <button type="button" className="tip-r" aria-pressed={approval === "full"} onClick={() => setApproval("full")} data-tip={t("detail.approval.fullTip")}><IconBolt size={16} />{t("detail.approval.full")}</button>
                </div>
              </div>
            </div>
            {errors.model && <p className="field-err">× {errors.model}</p>}

            {extSkills.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <p className="label" style={{ marginBottom: 6 }}>{t("form.skills")}</p>
                {extSkills.map((k) => (
                  <div key={k.file} className="toggle-row">
                    <p className="grow" style={{ fontSize: 13 }}>
                      <span className="mono">{k.name}</span> <span className="mute">· {k.from}{!k.ready && ` · ${t("form.skillPending")}`}</span>
                    </p>
                    {/* A skill waiting for review cannot be switched on, only off. */}
                    <Switch checked={(uses || !k.needsRoot) && skillOn(k.file)} onChange={(v) => toggleSkill(k, v)}
                      label={k.name} disabled={(k.needsRoot && !uses) || (!k.ready && !skillOn(k.file))} describedBy={`${id}-skills-ext`} />
                  </div>
                ))}
                <p id={`${id}-skills-ext`} className="hint" style={{ paddingTop: 6 }}>{t(uses || extSkills.every((k) => !k.needsRoot) ? "form.skillsExt" : "form.skillsNeedRoot")}</p>
                {engine === "pi" && piHumanRequestSelected && <p className="hint">{t(piHumanRequestOriginBlocked(scope) ? "form.piHumanRequestBlocked" : "form.piHumanRequestContext")}</p>}
              </div>
            )}

            {bot && (
              <div className="bd-meta">
                <span className="bd-mchip" data-tip={t("detail.meta.soul")} tabIndex={0}><IconDoc size={14} />{bot.soul.kind === "file" ? soulFileLabel(bot.soul.file).split("/").pop() : t(bot.soul.kind === "inline" ? "detail.meta.inline" : "detail.meta.default")}</span>
                <span className="bd-mchip" data-tip={bot.skills.length ? t("form.skillsReadOnly") : t("detail.meta.skills")} tabIndex={0}><IconLayers size={14} />{bot.skills.length ? bot.skills.join(", ") : t("detail.meta.noSkills")}</span>
                {commit && <span className="bd-mchip" data-tip={t("detail.meta.commit")} tabIndex={0}><IconCommit size={14} />{commit.slice(0, 7)}</span>}
              </div>
            )}
          </div>
        )}

        {current === "instrucciones" && (
          <div className="bd-panel">
            <div className={`bd-editor${soulOver ? " is-over" : ""}`}>
              <div className="bd-editor-bar">
                {SECTIONS.map((key) => (
                  <button key={key} type="button" className="bd-sec" data-tip={t("detail.addSection")} onClick={() => insertSection(key)}>+ {t(`detail.section.${key}`)}</button>
                ))}
                <span className="grow" />
                <span className="bd-ib" tabIndex={0} aria-label={t("detail.tip")} data-tip={t("detail.tip")}><IconBulb size={18} /></span>
                {omb && <a href={omb} target="_blank" rel="noopener noreferrer" className="bd-ib accent tip-r" aria-label={t("detail.try")} data-tip={t("detail.try")}><IconPlay size={16} /></a>}
              </div>
              <label htmlFor={`${id}-soul`} className="sr-only">{t("form.instructions")}</label>
              <textarea ref={soulRef} id={`${id}-soul`} value={soul}
                placeholder={bot?.soul.kind === "file" ? t("form.soulFilePlaceholder") : t("detail.soulPlaceholder")}
                aria-invalid={!!errors.soul || soulOver} aria-describedby={`${id}-count${errors.soul ? ` ${id}-soul-err` : ""}`}
                onChange={(e) => { setSoul(e.target.value); setErrors((x) => ({ ...x, soul: soulError(byteLength(e.target.value)) })); }} />
              <div className="bd-editor-foot">
                {bot?.soul.kind === "file" && <span className="bd-mchip" data-tip={t("form.soulFile")} tabIndex={0}><IconDoc size={14} />{soulFileLabel(bot.soul.file)}</span>}
                <span className="grow" />
                <span id={`${id}-count`} className={`counter${soulOver ? " over" : soulWarn ? " warn" : ""}`}>{t("form.bytes", { used: num.format(bytes), max: num.format(SOUL_MAX_BYTES) })}</span>
              </div>
            </div>
            {errors.soul && <p id={`${id}-soul-err`} className="field-err" style={{ marginTop: 8 }}>× {errors.soul}</p>}
          </div>
        )}

        {current === "conectores" && (
          <BotAccess
            scope={scope} onScope={(next) => { setScope(next); setScopeChanged(true); }}
            uses={uses} onUses={pickUses} usesLocked={!!bot?.usesWorkflows}
            runtime={runtime} botExists={!!bot} mcp={mcp} apps={apps}
            appChanges={appChanges}
            onAppChange={(slug, level) => setAppChanges((prev) => {
              const next = { ...prev };
              if (level === apps.level(slug)) delete next[slug]; else next[slug] = level;
              return next;
            })}
          />
        )}
      </div>

      {(dirty || saving || saveFailed) && (
        <div role="status" className="bd-savebar">
          {saveFailed ? <IconAlert size={16} className="bd-savebar-err" /> : <span className="bd-dot" aria-hidden="true" />}
          <p>{t(saveFailed ? "detail.saveFailed" : bot ? "detail.unsaved" : "form.newTitle")}</p>
          {bot && <button type="button" className="bd-ib" aria-label={t("detail.discard")} data-tip={t("detail.discard")} onClick={discard} disabled={saving}><IconUndo size={18} /></button>}
          <button type="button" className="btn btn-pri bd-save" onClick={() => void save()} disabled={saving} aria-busy={saving}
            data-tip={appsDirty ? t("detail.saveTipApps") : t("form.saveNote")}>
            {saving && <Spinner />}{t("form.save")}
          </button>
        </div>
      )}

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} labelledBy="del-t" className="small" role="alertdialog">
        <div className="modal-head"><h2 id="del-t">{t("form.deleteTitle", { name: bot?.name ?? "" })}</h2></div>
        <div className="modal-body"><p className="mute">{t("form.deleteBody")}</p></div>
        <div className="modal-foot" style={{ justifyContent: "flex-end", borderTop: 0, paddingTop: 0 }}>
          <button type="button" className="btn btn-soft" onClick={() => setConfirmDelete(false)}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-danger" onClick={remove}>{t("form.delete")}</button>
        </div>
      </Modal>
    </section>
  );
}

