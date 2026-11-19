// Bots: the list over team.yaml (draft vs file on disk) and the review/apply dialog.
import { useEffect, useMemo, useState } from "react";
import type { BotTab } from "../lib/router";
import { useTranslation } from "react-i18next";
import { DAGS, type Engine } from "../api/types";
import { IconBack, IconBot, IconChat, IconInfo, IconLayers, IconPencil, IconPlus, IconUndo, IconUsers } from "../components/Icons";
import { ConnectorLogo } from "../components/ConnectorLogo";
import { useObservation } from "../lib/bot-activity";
import { BotDetail } from "./BotForm";
import { unappliedCount } from "../components/Layout";
import { Avatar, Modal } from "../components/ui";
import { go, href } from "../lib/router";
import { accessFor } from "../lib/connector-access";
import { byteLength, parseTeam, readTeams, serializeTeam, soulFileLabel, splitModel, teamNames, upsertTeam, TEAM_BRIEF_MAX_BYTES, TEAM_NAME_MAX, type BotState, type Team } from "../lib/team";
import { botRoster, groupByTeam, unmatchedVersion } from "../lib/botRoster";
import { useDaguAction } from "../lib/useDaguAction";
import { ActionStatus, ActionError } from "../components/Action";
import { useStore } from "../store";
import { Preview } from "./Preview";
import { useEngineName } from "./Setup";


export function useEngineLabel() {
  const { t } = useTranslation();
  const { checkData } = useStore();
  return {
    engines: checkData?.engines ?? [],
    find: (id: string): Engine | undefined => checkData?.engines.find((e) => e.id === id),
    kind: (id: string) => {
      const e = checkData?.engines.find((x) => x.id === id);
      return e ? t(`bots.kind.${e.kind}`) : id || "—";
    },
  };
}

export function BotStatePill({ state }: { state: BotState }) {
  const { t } = useTranslation();
  if (state === "applied")
    return (
      <span className="dot-label">
        <span aria-hidden="true" className="dot" />
        {t("bots.state.applied")}
      </span>
    );
  const [cls, glyph] = state === "pending" ? ["pill-warn", "!"] : state === "new" ? ["pill-accent", "+"] : ["pill-down", "−"];
  return (
    <span className={`pill ${cls}`}>
      <span aria-hidden="true" className="glyph">{glyph}</span>
      {t(`bots.state.${state}`)}
    </span>
  );
}

export function Bots({ review, index, tab, native }: { review: boolean; index?: number | null; tab?: BotTab; native?: string }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const eng = useEngineLabel();
  const observation = useObservation();
  const connections = useDaguAction<{ servers: { name: string }[] }>(s.backend, DAGS.botArchitect, "RESULT");
  useEffect(() => { if (!s.mock) void connections.start({ OP: "connections" }); }, []);
  const importing = useDaguAction<{ botId: string; commit: string }>(s.backend, DAGS.botArchitect, "result");
  const importBot = async (id: string) => {
    if (s.draft || importing.phase === "running") return;
    const result = await importing.start({ OP: "import", BOT_ID: id });
    if (result) s.reload();
  };
  const runtime = s.runtimeBots.data ?? null;
  const runtimeError = s.runtimeBots.status === "error";
  const rows = botRoster(s.rows, s.mock ? null : runtime);
  const teams = useMemo((): Team[] => { try { return s.workingText ? readTeams(parseTeam(s.workingText)) : []; } catch { return []; } }, [s.workingText]);
  const groups = groupByTeam(rows, teams.map((x) => x.name));
  const grouped = groups.some((g) => g.team);
  const inventory = s.botVersioning.status === "ok" ? s.botVersioning.data : undefined;
  const synchronized = s.team.status === "ok" && s.runtimeBots.status === "ok" && !s.draftConflict;
  const omb = s.project.data?.urls.omb;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // The department dialog: `null` creates one, a name edits that one's shared instructions.
  const [department, setDepartment] = useState<{ name: string | null } | undefined>();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const unapplied = unappliedCount(s);
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" });
  const engineName = useEngineName();
  const available = eng.engines.filter((e) => e.ok).map(engineName);

  // Selection: explicit route first; on wide screens, the first editable bot.
  const explicit = index !== undefined || !!native;
  const live = rows.filter((r) => r.configuration?.state !== "deleted");
  const fallback = live.find((r) => r.configuration)?.configuration?.bot.index;
  const selectedIndex = index !== undefined ? index : native ? undefined : fallback;
  const selectedRow = native ? rows.find((r) => r.nativeId === native)
    : selectedIndex === null ? undefined : rows.find((r) => r.configuration?.bot.index === selectedIndex && r.configuration?.state !== "deleted");
  const selectedBot = native ? selectedRow?.configuration?.bot : selectedIndex === null ? null : s.workingBots.find((b) => b.index === selectedIndex);
  const runtimeFor = (name: string) => { const matches = (runtime || []).filter((b) => b.name === name); return matches.length === 1 ? matches[0] : undefined; };

  const logos = (row: (typeof rows)[number]) => {
    const state = row.configuration?.state ?? "applied";
    const liveBot = runtime?.find((b) => b.id === row.nativeId);
    const scope = row.configuration && state !== "applied" ? row.configuration.bot.tools : liveBot ? liveBot.toolScope : row.configuration?.bot.tools;
    const known = [...new Set([
      ...(connections.phase === "ok" ? (connections.output?.servers || []).map((x) => x.name) : []),
      ...[...scope?.allow || [], ...scope?.deny || []].flatMap((sel) => { const m = /^mcp:([^:]+):/.exec(sel); return m ? [m[1]!] : []; }),
    ])];
    return known.filter((server) => accessFor(scope, server) !== "none");
  };

  return (
    <main className={`page bots-split${explicit || review ? " has-selection" : ""}`}>
      <div className="bots-list">
        <div className="bots-list-head">
          <h1>{t("bots.title")}</h1>
          <span className="bd-ib" tabIndex={0} aria-label={t("bots.subtitle")} data-tip={t("bots.subtitle")}><IconInfo size={16} /></span>
          <span className="grow" />
          <button type="button" className="bd-ib tip-r" aria-label={t("bots.templates.add")} data-tip={t("bots.templates.add")} disabled={s.team.status !== "ok"} onClick={() => setTemplatesOpen(true)}><IconLayers size={18} /></button>
          <button type="button" className="bd-ib tip-r" aria-label={t("bots.team.create")} data-tip={t("bots.team.create")} disabled={s.team.status !== "ok"} onClick={() => setDepartment({ name: null })}><IconUsers size={18} /></button>
          <a href={href.newBot} className="bd-ib accent-solid tip-r" aria-label={t("bots.add")} data-tip={t("bots.add")}><IconPlus size={18} /></a>
        </div>

        {s.team.status === "error" && (
          <div role="alert" className="banner banner-down">
            <p className="grow"><strong style={{ color: "var(--fy-down)" }}>{t("common.loadError", { what: "team.yaml" })}</strong> {s.team.error}</p>
            <button type="button" className="btn btn-sm btn-soft" onClick={s.reload}>{t("common.retry")}</button>
          </div>
        )}
        {!s.mock && runtimeError && <p role="alert" className="banner banner-down">{t("bots.runtimeError")}</p>}
        {!s.mock && s.botVersioning.status === "error" && <p role="alert" className="banner banner-warn">{t("bots.versionUnavailable")}</p>}

        {s.draftConflict && <div role="alert" className="banner banner-warn">
          <p>{t("bots.draftConflict")}</p>
          <button type="button" className="btn btn-sm btn-soft" onClick={() => setConfirmDiscard(true)}>{t("bots.discard")}</button>
        </div>}

        {!s.draftConflict && unapplied > 0 && (
          <div role="status" className="bots-pending">
            <p><strong>{t("bots.banner", { count: unapplied })}</strong></p>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {s.draft && <button type="button" className="bd-ib" aria-label={t("bots.discard")} data-tip={t("bots.discard")} onClick={() => setConfirmDiscard(true)}><IconUndo size={16} /></button>}
              <a href={href.review} className="btn btn-sm btn-pri" title={t("bots.bannerBody")}>{t("bots.review")}</a>
            </div>
          </div>
        )}

        {s.team.status === "loading" ? (
          <ul className="bots-picks" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="bots-pick fy-sk" aria-hidden="true">
                <span className="skel" style={{ width: 36, height: 36, borderRadius: "var(--fy-radius-box)" }} />
                <span className="skel" style={{ width: "60%", height: 10 }} />
              </li>
            ))}
          </ul>
        ) : rows.length === 0 && groups.length === 0 ? (
          <div className="card empty">
            <span aria-hidden="true" className="empty-icon"><IconBot size={22} /></span>
            <p className="empty-title">{t("bots.emptyTitle")}</p>
            <p className="mute" style={{ maxWidth: 360 }}>{t("bots.emptyBody")}</p>
            <a href={href.newBot} className="btn btn-lg btn-pri" style={{ marginTop: 4 }}>+ {t("bots.add")}</a>
          </div>
        ) : (
          groups.map((group) => (
          <section key={group.team || "-"} className="bots-team" aria-label={grouped ? group.team || t("bots.team.none") : undefined}>
          {grouped && <TeamHeading name={group.team} team={teams.find((x) => x.name.toLowerCase() === group.team.toLowerCase())} count={group.rows.length}
            onEdit={group.team && s.team.status === "ok" ? () => setDepartment({ name: group.team }) : undefined} />}
          <ul className="bots-picks">
            {group.rows.map((row) => {
              const state = row.configuration?.state ?? "applied";
              const target = state === "deleted" || row.ambiguous ? undefined
                : row.nativeId ? href.nativeBot(row.nativeId)
                : row.configuration ? href.bot(row.configuration.bot.index) : undefined;
              const version = unmatchedVersion(row, inventory, synchronized);
              const current = row === selectedRow;
              const servers = logos(row);
              const content = (
                <>
                  <Avatar name={row.name} omb={omb} appearance={row.appearance} />
                  <span className="bots-pick-text">
                    <span className="bots-pick-name ellipsis">{row.name}</span>
                    {servers.length > 0 && (
                      <span className="bots-stack" aria-label={t("botConnectors.summary", { names: list.format(servers) })}>
                        {servers.slice(0, 4).map((name) => <ConnectorLogo key={name} label={name} />)}
                        {servers.length > 4 && <span className="bots-more">+{servers.length - 4}</span>}
                      </span>
                    )}
                  </span>
                  {state !== "applied" ? <span className={`bots-state is-${state}`} title={t(`bots.state.${state}`)}><span className="sr-only">{t(`bots.state.${state}`)}</span></span>
                    : !row.configuration && <span className="bots-native" title={t(`bots.version.${version}`)}><span className="sr-only">{t(`bots.version.${version}`)}</span></span>}
                </>
              );
              return (
                <li key={row.key}>
                  {target ? <a href={target} className={`bots-pick${state === "deleted" ? " is-deleted" : ""}`} aria-current={current ? "true" : undefined} aria-label={t("bots.edit", { name: row.name })}>{content}</a>
                    : <div className={`bots-pick${state === "deleted" ? " is-deleted" : ""}`}>{content}</div>}
                </li>
              );
            })}
          </ul>
          </section>
          ))
        )}

        <p className="note bots-engines">
          {available.length > 0 ? t("bots.enginesAvailable", { list: list.format(available) }) : t("bots.enginesUnknown")}{" "}
          <a href={href.setup}>{t("bots.enginesReview")}</a>
        </p>
      </div>

      <div className="bots-detail">
        {selectedRow && !selectedRow.configuration && selectedRow.nativeId ? (
          <NativeBot row={selectedRow} version={unmatchedVersion(selectedRow, inventory, synchronized)}
            importing={importing} onImport={() => void importBot(selectedRow.nativeId!)} />
        ) : selectedIndex === null ? (
          <BotDetail key="new" bot={null} tab={tab} observation={observation} />
        ) : selectedBot ? (
          <BotDetail key={`${selectedBot.index}:${selectedBot.fingerprint}`} bot={selectedBot} tab={tab} runtime={runtimeFor(selectedBot.name)} observation={observation} />
        ) : index !== undefined && s.team.status === "ok" ? (
          <div className="card empty"><p>{t("form.notFound")}</p><a href={href.bots}>← {t("form.back")}</a></div>
        ) : null}
      </div>

      <Preview open={review} onClose={() => go(href.bots)} />

      {department && <DepartmentDialog name={department.name} team={teams.find((x) => x.name.toLowerCase() === department.name?.toLowerCase())}
        runtimeSections={(runtime ?? []).map((b) => b.section ?? "")} onClose={() => setDepartment(undefined)} />}

      {templatesOpen && <TemplatesDialog teams={teams} onClose={() => setTemplatesOpen(false)} />}

      <Modal open={confirmDiscard} onClose={() => setConfirmDiscard(false)} labelledBy="discard-t" className="small" role="alertdialog">
        <div className="modal-head"><h2 id="discard-t">{t("bots.discardTitle")}</h2></div>
        <div className="modal-body"><p className="mute">{t("bots.discardBody")}</p></div>
        <div className="modal-foot" style={{ justifyContent: "flex-end", borderTop: 0, paddingTop: 0 }}>
          <button type="button" className="btn btn-soft" onClick={() => setConfirmDiscard(false)}>{t("common.cancel")}</button>
          <button type="button" className="btn btn-danger" onClick={() => { s.setDraft(null); setConfirmDiscard(false); }}>{t("bots.discard")}</button>
        </div>
      </Modal>
    </main>
  );
}

/** A team's heading in the list: its name and, read-only, its shared brief (D81). */
function TeamHeading({ name, team, count, onEdit }: { name: string; team?: Team; count: number; onEdit?: () => void }) {
  const { t } = useTranslation();
  const brief = team?.brief;
  return (
    <div className="bots-team-head">
      <p className="bots-team-name"><span className="ellipsis">{name || t("bots.team.none")}</span><span className="mute">{count}</span>
        {onEdit && <><span className="grow" /><button type="button" className="bd-ib bots-team-edit" aria-label={t("bots.team.edit", { name })} data-tip={t("bots.team.brief")} onClick={onEdit}><IconPencil size={14} /></button></>}</p>
      {brief?.kind === "file" && <p className="hint ellipsis" title={soulFileLabel(brief.file)}>{t("bots.team.briefFile")}: <span className="mono">{soulFileLabel(brief.file)}</span></p>}
      {brief?.kind === "inline" && (
        <details className="bots-team-brief">
          <summary className="hint">{t("bots.team.brief")}</summary>
          <p className="hint" style={{ whiteSpace: "pre-wrap" }}>{brief.text}</p>
        </details>
      )}
    </div>
  );
}

/**
 * Create a department or edit its shared instructions in the draft (D81). OpenMausBot
 * applies it with the bots; it never renames or deletes a department from the file.
 */
function DepartmentDialog({ name, team, runtimeSections, onClose }: { name: string | null; team?: Team; runtimeSections: string[]; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useStore();
  const creating = name === null;
  const fromFile = team?.brief.kind === "file" ? team.brief.file : undefined;
  const [value, setValue] = useState("");
  const [brief, setBrief] = useState(team?.brief.kind === "inline" ? team.brief.text.replace(/\n$/, "") : "");
  const [error, setError] = useState<string>();
  const taken = (candidate: string) => {
    const key = candidate.trim().toLowerCase();
    let names: string[] = [];
    try { names = teamNames(parseTeam(s.workingText ?? "version: 1\n")); } catch { /* unreadable draft: the save reports it */ }
    return key === "general" || [...names, ...runtimeSections].some((n) => n.trim().toLowerCase() === key);
  };
  const save = () => {
    const next = value.trim();
    if (creating && !next) return setError(t("bots.team.nameRequired"));
    if (creating && next.length > TEAM_NAME_MAX) return setError(t("bots.team.nameLong", { max: TEAM_NAME_MAX }));
    if (creating && taken(next)) return setError(t("bots.team.nameTaken"));
    if (byteLength(brief) > TEAM_BRIEF_MAX_BYTES) return setError(t("bots.team.briefLong"));
    try {
      const doc = parseTeam(s.workingText ?? "version: 1\nbots: []\n");
      upsertTeam(doc, name, { name: next, brief: fromFile ? null : brief });
      s.setDraft(serializeTeam(doc));
      onClose();
    } catch (e) { setError(String((e as Error).message ?? e)); }
  };
  return (
    <Modal open onClose={onClose} labelledBy="department-t">
      <form onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="modal-head"><h2 id="department-t">{creating ? t("bots.team.create") : t("bots.team.editTitle", { name })}</h2></div>
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {creating && <label className="field">{t("bots.team.name")}
            <input className="input" autoFocus value={value} maxLength={TEAM_NAME_MAX} aria-invalid={!!error}
              onChange={(e) => { setValue(e.target.value.replace(/\n/g, " ")); setError(undefined); }} /></label>}
          {fromFile
            ? <p className="hint">{t("bots.team.briefFile")}: <span className="mono">{soulFileLabel(fromFile)}</span></p>
            : <label className="field">{t("bots.team.brief")}
                <textarea className="input" rows={8} value={brief} autoFocus={!creating} onChange={(e) => { setBrief(e.target.value); setError(undefined); }} />
                <span className="hint">{t("bots.team.briefHint")}</span></label>}
          {creating && <p className="hint">{t("bots.team.createHint")}</p>}
          {error && <p className="field-err" role="alert">× {error}</p>}
        </div>
        <div className="modal-foot" style={{ justifyContent: "flex-end", borderTop: 0, paddingTop: 0 }}>
          <button type="button" className="btn btn-soft" onClick={onClose}>{t("common.cancel")}</button>
          <button type="submit" className="btn btn-pri" disabled={!!fromFile && !creating}>{t(creating ? "bots.team.createSave" : "bots.team.save")}</button>
        </div>
      </form>
    </Modal>
  );
}

type DepartmentTemplate = { source: string; extension: string; slug: string; departamento?: string; brief?: string;
  bots?: { name: string; title?: string }[]; rooms?: string[]; skills?: number; error?: string };

/**
 * Add a department an installed extension ships (D82). The import commits its skill
 * files and returns the proposed team.yaml, which opens as the draft: the person
 * reviews and applies it like any other change.
 */
function TemplatesDialog({ teams, onClose }: { teams: Team[]; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const list = new Intl.ListFormat(i18n.language, { type: "conjunction" });
  const listing = useDaguAction<{ templates: DepartmentTemplate[] }>(s.backend, DAGS.botArchitect, "RESULT");
  const importing = useDaguAction<{ proposedTeamYaml: string; commit: string | null; slug: string }>(s.backend, DAGS.botArchitect, "RESULT");
  const [chosen, setChosen] = useState<string>();
  useEffect(() => { void listing.start({ OP: "team-templates" }); }, []);
  const blocked = !!s.draft || !s.draftReady;
  const add = async (source: string) => {
    if (blocked || importing.phase === "running") return;
    setChosen(source);
    const result = await importing.start({ OP: "team-import", SOURCE: source });
    if (result?.proposedTeamYaml) { s.setDraft(result.proposedTeamYaml); onClose(); }
  };
  const templates = listing.output?.templates ?? [];
  return (
    <Modal open onClose={onClose} labelledBy="templates-t">
      <div className="modal-head"><h2 id="templates-t">{t("bots.templates.title")}</h2></div>
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="mute">{t("bots.templates.body")}</p>
        {blocked && <p className="note">{t("bots.templates.draftHint")}</p>}
        {listing.phase === "running" || listing.phase === "loading" ? <p className="hint" aria-busy="true">{t("bots.templates.loading")}</p>
          : listing.phase === "failed" ? <ActionError action={listing} />
          : templates.length === 0 ? <p className="hint">{t("bots.templates.empty")}</p>
          : <ul className="bots-picks" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {templates.map((item) => {
                const exists = !!item.departamento && teams.some((x) => x.name.toLowerCase() === item.departamento!.toLowerCase());
                return (
                  <li key={item.source} className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    <p style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <strong className="grow ellipsis">{item.departamento || item.slug}</strong>
                      <span className="pill pill-outline">{t("bots.templates.from", { ext: item.extension })}</span>
                    </p>
                    {item.error ? <p className="field-err">{t("bots.templates.invalid", { error: item.error })}</p> : <>
                      {item.brief && <p className="hint" style={{ whiteSpace: "pre-wrap" }}>{item.brief}</p>}
                      <p className="hint">{t("bots.templates.bots", { list: list.format((item.bots ?? []).map((b) => b.name)) })}</p>
                      {(item.rooms ?? []).length > 0 && <p className="hint">{t("bots.templates.rooms", { list: list.format(item.rooms ?? []) })}</p>}
                      {!!item.skills && <p className="hint">{t("bots.templates.skills", { count: item.skills })}</p>}
                      {exists && <p className="note">{t("bots.templates.replaces")}</p>}
                      {chosen === item.source && importing.phase !== "never" && <div><ActionStatus action={importing} /><ActionError action={importing} /></div>}
                      <button type="button" className="btn btn-sm btn-pri" style={{ alignSelf: "flex-start" }} disabled={blocked || importing.phase === "running"}
                        aria-label={t("bots.templates.chooseNamed", { name: item.departamento })} onClick={() => void add(item.source)}>{t("bots.templates.choose")}</button>
                    </>}
                  </li>
                );
              })}
            </ul>}
      </div>
      <div className="modal-foot" style={{ justifyContent: "flex-end", borderTop: 0, paddingTop: 0 }}>
        <button type="button" className="btn btn-soft" onClick={onClose}>{t("common.close")}</button>
      </div>
    </Modal>
  );
}

/** A bot that lives only in OpenMausBot: it can be imported into the project, not edited here. */
function NativeBot({ row, version, importing, onImport }: { row: ReturnType<typeof botRoster>[number]; version: ReturnType<typeof unmatchedVersion>; importing: ReturnType<typeof useDaguAction<{ botId: string; commit: string }>>; onImport: () => void }) {
  const { t } = useTranslation();
  const s = useStore();
  const canImport = version === "native" || version === "snapshot";
  const { modelId } = splitModel(row.model);
  return (
    <section className="card bd">
      <div className="bd-hero">
        <a href={href.bots} className="bd-ib bd-back" aria-label={t("form.backAria")}><IconBack size={18} /></a>
        <span className="bd-ava" aria-hidden="true"><Avatar name={row.name} omb={s.project.data?.urls.omb} appearance={row.appearance} large /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="bd-title"><h2 className="ellipsis">{row.name}</h2><span className={`pill ${version === "native" ? "pill-warn" : "pill-outline"}`} title={t("bots.versionHint")}>{t(`bots.version.${version}`)}</span></div>
          <p className="mute ellipsis">{row.title || "—"}</p>
        </div>
        {s.project.data && <div className="bd-toolbar"><a href={s.project.data.urls.omb} target="_blank" rel="noopener noreferrer" className="bd-ib" aria-label={t("bots.runtimeOpen")} data-tip={t("bots.runtimeOpen")}><IconChat size={18} /></a></div>}
      </div>
      <div className="bd-panel" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="bd-mchip" style={{ alignSelf: "flex-start" }}>{modelId || "—"}</span>
        {s.draft && <p className="note">{t("bots.importDraftHint")}</p>}
        {s.botVersioning.data?.projectDirty && <p className="note">{t("bots.importDirtyHint")}</p>}
        {importing.phase !== "never" && <div><ActionStatus action={importing} /><ActionError action={importing} /></div>}
        {canImport && <button type="button" className="btn btn-pri" style={{ alignSelf: "flex-start" }} disabled={!!s.draft || !!s.botVersioning.data?.projectDirty || !s.draftReady || importing.phase === "running"} onClick={onImport} aria-label={t("bots.importNamed", { name: row.name })}>{t("bots.import")}</button>}
      </div>
    </section>
  );
}
