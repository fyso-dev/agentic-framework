// Bots: the list over team.yaml (draft vs file on disk) and the review/apply dialog.
import { useEffect, useState } from "react";
import type { BotTab } from "../lib/router";
import { useTranslation } from "react-i18next";
import { DAGS, type Engine } from "../api/types";
import { IconBack, IconBot, IconChat, IconInfo, IconPlus, IconUndo } from "../components/Icons";
import { ConnectorLogo } from "../components/ConnectorLogo";
import { useObservation } from "../lib/bot-activity";
import { BotDetail } from "./BotForm";
import { unappliedCount } from "../components/Layout";
import { Avatar, Modal } from "../components/ui";
import { go, href } from "../lib/router";
import { accessFor } from "../lib/connector-access";
import { splitModel, type BotState } from "../lib/team";
import { botRoster, unmatchedVersion } from "../lib/botRoster";
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
  const inventory = s.botVersioning.status === "ok" ? s.botVersioning.data : undefined;
  const synchronized = s.team.status === "ok" && s.runtimeBots.status === "ok" && !s.draftConflict;
  const omb = s.project.data?.urls.omb;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
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
        ) : rows.length === 0 ? (
          <div className="card empty">
            <span aria-hidden="true" className="empty-icon"><IconBot size={22} /></span>
            <p style={{ fontWeight: 700, fontSize: 16 }}>{t("bots.emptyTitle")}</p>
            <p className="mute" style={{ maxWidth: 360 }}>{t("bots.emptyBody")}</p>
            <a href={href.newBot} className="btn btn-lg btn-pri" style={{ marginTop: 4 }}>+ {t("bots.add")}</a>
          </div>
        ) : (
          <ul className="bots-picks">
            {rows.map((row) => {
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
