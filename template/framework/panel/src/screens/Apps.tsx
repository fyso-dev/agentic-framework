// Apps, in three tabs (the third, third-party skills, lives in Skills.tsx). "Open" is a tile launcher: framework apps (Dagu, OpenMausBot), the
// project's own apps and the apps added by extensions, each with its health. "Extensions"
// lists the installed extensions (docs/extensions-contract.md §5) and the marketplace (§8),
// which installs and upgrades through the fyso-ext-catalog and fyso-ext-install workflows.
// Each installed extension asks for its declared secrets (guided setup, D50) and runs its
// workflows. Uninstalling runs fyso-ext-remove after an in-page confirmation. The framework itself is updated
// through fyso-update. Details live in tooltips; the page keeps text short.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DAGS, type App, type ExtInstallResult, type UpdateResult, type Extension, type Health, type Marketplace as Catalog, type MarketplaceEntry } from "../api/types";
import { ActionButton, ActionError, ActionStatus } from "../components/Action";
import {
  AppIcon, IconApps, IconArrowUpRight, IconCheck, IconDownload, IconExternal, IconFlow, IconInfo, IconLayers,
  IconLock, IconLockOpen, IconPlug, IconPlus, IconPuzzle, IconRefresh, IconSearch, IconTerminal, IconTrash, Spinner,
} from "../components/Icons";
import { ExtensionSetup } from "../components/ExtensionSetup";
import { ExtensionWorkflow } from "../components/ExtensionWorkflow";
import { CopyLine } from "../components/ui";
import { SkillsTab } from "./Skills";
import { localized } from "../lib/i18n";
import { go, href, type AppsTab } from "../lib/router";
import { useDaguAction, type Action } from "../lib/useDaguAction";
import { useStore } from "../store";

const host = (url: string) => {
  try {
    return new URL(url, location.href).host;
  } catch {
    return url;
  }
};

/** `v1.2.0` → [1, 2, 0]; null for refs that are not versions (same rule as marketplace.cjs). */
function versionOf(ref: string | null): number[] | null {
  const m = /^v?(\d+(?:\.\d+)*)(?:-|$)/.exec(ref ?? "");
  return m ? m[1].split(".").map(Number) : null;
}
function newer(latest: string | null, current: string | null): boolean {
  const a = versionOf(latest), b = versionOf(current);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

// ── Open ────────────────────────────────────────────────────────────────────

function AppTile({ app }: { app: App }) {
  const { t, i18n } = useTranslation();
  const { health } = useStore();
  const lang = i18n.language;
  const h: Health = health[app.id] ?? "unknown";
  const name = localized(lang, app.name, app.name_i18n);
  const description = localized(lang, app.description, app.description_i18n);
  const note = app.accessNote ? localized(lang, app.accessNote, app.accessNote_i18n) : undefined;
  const off = !app.enabled;
  const down = !off && h === "down";
  const dot = off ? "unknown" : h;
  const flag = off
    ? <span className="ap-tag" data-tip={t("apps.offTip")}>{t("apps.off")}</span>
    : down
      ? <span className="ap-tag down" data-tip={t("apps.downTip")}>{t("apps.downFlag")}</span>
      : note
        ? <span className="ap-tag acc ap-note" data-tip={note}>{note}</span>
        : null;
  const body = (
    <>
      <div className="ap-tile-top">
        <span aria-hidden="true" className="ap-ic"><AppIcon name={app.icon} size={22} /></span>
        <span className={`ap-dot ${dot} tip-r`} data-tip={off ? t("apps.off") : t(`apps.healthTip.${h}`, { host: host(app.url) })} />
      </div>
      <div className="ap-tile-text">
        <h3>{name}</h3>
        <p>{description}</p>
      </div>
      {flag}
    </>
  );
  if (off) {
    return <li><div className="ap-tile off" aria-label={t("apps.offAria", { name })}>{body}</div></li>;
  }
  if (app.embed) {
    return (
      <li>
        <a className={`ap-tile${down ? " down" : ""}`} href={href.app(app.id)}>
          {body}
          <span className="sr-only">{t(`apps.health.${h}`)}</span>
        </a>
      </li>
    );
  }
  return (
    <li>
      <a className={`ap-tile${down ? " down" : ""}`} href={app.url} target="_blank" rel="noopener noreferrer">
        {body}
        <span className="ap-go" aria-hidden="true"><IconArrowUpRight size={18} /></span>
        <span className="sr-only">{t(`apps.health.${h}`)} · {t("common.newTab")}</span>
      </a>
    </li>
  );
}

function AddTile() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const command = t("apps.emptyCommand");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: the command stays in the tooltip */
    }
  };
  return (
    <li>
      <button type="button" className="ap-add" aria-label={`${t("apps.add")}: ${command}`} data-tip={copied ? t("apps.addCopied") : t("apps.addTip", { command })} onClick={() => void copy()}>
        <IconPlus size={22} />
      </button>
    </li>
  );
}

function TileSkeleton() {
  return (
    <ul className="ap-grid" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="ap-tile fy-sk">
          <span className="skel" style={{ width: 44, height: 44, borderRadius: "var(--fy-radius-lg)" }} />
          <span style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="skel" style={{ width: "50%", height: 12 }} />
            <span className="skel" style={{ width: "70%", height: 9 }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function OpenTab() {
  const { t } = useTranslation();
  const s = useStore();
  const apps = s.apps.data ?? [];
  const groups: { id: App["group"]; title: string; apps: App[] }[] = [
    { id: "framework", title: t("apps.framework"), apps: apps.filter((a) => a.group === "framework") },
    { id: "project", title: s.project.data?.brand?.name ?? s.project.data?.name ?? t("apps.project"), apps: apps.filter((a) => a.group === "project") },
    { id: "extension", title: t("apps.extension"), apps: apps.filter((a) => a.group === "extension") },
  ];
  return (
    <div role="tabpanel" id="apps-panel-open" aria-labelledby="apps-tab-open">
      {s.apps.status === "error" && (
        <div role="alert" className="banner banner-down">
          <p className="grow"><strong style={{ color: "var(--fy-down)" }}>{t("common.loadError", { what: "apps.json" })}</strong> {s.apps.error}</p>
          <button type="button" className="btn btn-sm btn-soft" onClick={s.reload}>{t("common.retry")}</button>
        </div>
      )}
      {groups.filter((g) => g.id !== "extension" || g.apps.length > 0).map((g) => (
        <section key={g.id} aria-label={g.title}>
          <h2 className="ap-cap">{g.title} {s.apps.status === "ok" && <span className="n">{g.apps.length}</span>}</h2>
          {s.apps.status === "loading" ? (
            <TileSkeleton />
          ) : (
            <ul className="ap-grid">
              {g.apps.map((a) => <AppTile key={a.id} app={a} />)}
              {g.id === "project" && s.apps.status === "ok" && <AddTile />}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

// ── Extensions ──────────────────────────────────────────────────────────────

/** Which card started the install: the installed card or the catalog card. */
type Where = "installed" | "catalog";

type Market = {
  catalog: Action<Catalog>;
  install: Action<ExtInstallResult>;
  remove: Action<ExtInstallResult>;
  target: { id: string; where: Where } | null;
  /** The extension the last uninstall was for. */
  removing: string | null;
  /** An install or an uninstall is running: one lifecycle change at a time. */
  busy: boolean;
  entries: MarketplaceEntry[];
  onInstall: (entry: MarketplaceEntry, where: Where) => void;
  onRemove: (id: string) => void;
};

function useMarket(): Market {
  const s = useStore();
  const catalog = useDaguAction<Catalog>(s.backend, DAGS.extCatalog, "catalog", { loadLast: true });
  const install = useDaguAction<ExtInstallResult>(s.backend, DAGS.extInstall, "result");
  const remove = useDaguAction<ExtInstallResult>(s.backend, DAGS.extRemove, "result");
  const [target, setTarget] = useState<Market["target"]>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  // Install state comes from extensions.json (always current), not from the last catalog read.
  const local = new Map((s.extensions.data ?? []).map((e) => [e.id, e.version]));
  const entries = (catalog.output?.extensions ?? []).map((e): MarketplaceEntry => {
    if (s.extensions.status !== "ok") return e;
    const version = local.get(e.id) ?? null;
    return { ...e, installed: local.has(e.id), version, update: local.has(e.id) && newer(e.latest, version) };
  });
  const onInstall = async (entry: MarketplaceEntry, where: Where) => {
    setTarget({ id: entry.id, where });
    const result = await install.start({ ID: entry.id, MODE: entry.installed ? "update" : "add" });
    // Re-read the installed list whatever the outcome: a run can change files and still fail later.
    s.reload();
    if (result) void catalog.start();
  };
  const onRemove = async (id: string) => {
    setRemoving(id);
    await remove.start({ ID: id });
    s.reload();
  };
  const busy = install.phase === "running" || remove.phase === "running";
  return {
    catalog, install, remove, target, removing, busy, entries,
    onInstall: (e, where) => void onInstall(e, where), onRemove: (id) => void onRemove(id),
  };
}

/** Install / update control, shared by the installed card and the catalog card. */
function InstallControl({ entry, market, where }: { entry: MarketplaceEntry; market: Market; where: Where }) {
  const { t } = useTranslation();
  const busy = market.busy;
  if (market.target?.id === entry.id && market.install.phase === "running") {
    return <span className="ap-tag acc" role="status"><Spinner />{entry.installed ? t("market.updating") : t("market.installing")}</span>;
  }
  if (entry.error) return <span className="ap-tag">{t("market.versionsUnavailable")}</span>;
  if (!entry.latest) return <span className="ap-tag">{t("market.noTags")}</span>;
  if (entry.installed && !entry.update) {
    return <span className="ap-tag ok"><IconCheck size={13} />{t("market.installedShort")}</span>;
  }
  return (
    <button type="button" className="btn btn-pri ap-btn" data-tip={t("market.commitTip")} disabled={busy} onClick={() => market.onInstall(entry, where)}>
      {entry.update ? <><IconDownload size={16} />{t("market.update", { version: entry.latest })}</> : <><IconPlus size={16} />{t("market.installShort")}</>}
    </button>
  );
}

/** Install outcome under the card that ran it. */
function InstallOutcome({ entry, market, where }: { entry: MarketplaceEntry; market: Market; where: Where }) {
  const { t } = useTranslation();
  if (market.target?.id !== entry.id || market.target.where !== where) return null;
  const out = market.install.phase === "ok" ? market.install.output : undefined;
  return (
    <>
      <ActionError action={market.install as Action<unknown>} />
      {out && (
        <div role="status" className="ap-done">
          <p className="mute">{t("market.done", { id: out.id, version: out.version ?? "", commit: out.commit })}</p>
        </div>
      )}
    </>
  );
}

function ExtensionCard({ ext, entry, market }: { ext: Extension; entry?: MarketplaceEntry; market: Market }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { reload } = useStore();
  const missing = ext.secrets.filter((x) => x.required && !x.set);
  const [confirming, setConfirming] = useState(false);
  const removingThis = market.removing === ext.id && market.remove.phase === "running";
  const caps = [
    { n: ext.mcpServers.length, tip: t("ext.mcpTip"), Icon: IconPlug },
    { n: ext.workflows.length, tip: t("ext.workflowsTip"), Icon: IconFlow },
    { n: ext.skills.length, tip: t("ext.skillsTip"), Icon: IconLayers },
    { n: ext.apps.length, tip: t("ext.appsTip"), Icon: IconApps },
  ].filter((c) => c.n > 0);
  const name = entry ? localized(lang, entry.name, entry.name_i18n) : ext.id;
  return (
    <li className="ap-ext">
      <div className="ap-ext-head">
        <span aria-hidden="true" className="ap-ic"><IconPuzzle size={22} /></span>
        <div className="ap-ext-title">
          <h3>{name}</h3>
          <p className="sub mono ellipsis" data-tip={t("ext.source")}>{ext.src}</p>
        </div>
        {missing.length > 0 ? (
          <span className="ap-tag down"><IconLock size={13} />{t("ext.missing", { count: missing.length })}</span>
        ) : (
          <span className="ap-tag ok" data-tip={t("ext.readyTip")}><IconCheck size={13} />{t("ext.ready")}</span>
        )}
      </div>
      {caps.length > 0 && (
        <ul className="ap-chips">
          {caps.map(({ n, tip, Icon }) => (
            <li key={tip} className="ap-cap-chip" data-tip={tip}><Icon size={16} />{n}<span className="sr-only"> {tip}</span></li>
          ))}
        </ul>
      )}
      <details className="ap-ext-advanced">
        <summary>{t("ext.advanced")}</summary>
        <div className="ap-ext-advanced-body">
          {ext.secrets.length > 0 && (
            <ul className="ap-chips" aria-label={t("ext.secrets")}>
              {ext.secrets.map((x) => {
                const desc = x.description ? localized(lang, x.description, x.description_i18n) : undefined;
                const state = x.set ? t("ext.secretSet") : x.required ? t("ext.secretMissing") : t("ext.secretOptional");
                const tip = desc ? `${state} · ${desc}` : state;
                return (
                  <li key={x.name} className={`ap-secret ${x.set ? "set" : x.required ? "miss" : "opt"}`} data-tip={tip}>
                    {x.set ? <IconLock size={12} /> : <IconLockOpen size={12} />}{x.name}<span className="sr-only"> {state}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {ext.workflows.length > 0 && (
            <ul aria-label={t("ext.workflows", { count: ext.workflows.length })} style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {ext.workflows.map((dag) => <ExtensionWorkflow key={dag} dag={dag} />)}
            </ul>
          )}
          <ExtensionSetup ext={ext} onSaved={reload} />
          <div className="ap-foot">
            <span className="ap-tag" data-tip={t("ext.versionTip")}>{ext.version ?? t("ext.noVersion")}</span>
            <span className="grow" />
            {entry?.update && !confirming && <InstallControl entry={entry} market={market} where="installed" />}
            {removingThis ? (
              <span className="ap-tag acc" role="status"><Spinner />{t("market.removing")}</span>
            ) : !confirming && (
              <button type="button" className="bd-ib" disabled={market.busy} aria-label={t("market.remove", { name })} data-tip={t("market.remove", { name })}
                onClick={() => setConfirming(true)}><IconTrash size={18} /></button>
            )}
          </div>
          {confirming && !removingThis && (
            <div role="group" aria-label={t("market.removeTitle", { name })} className="card action">
              <p><strong>{t("market.removeTitle", { name })}</strong> <span className="mute">{t("market.removeHint")}</span></p>
              <div className="ap-foot">
                <span className="grow" />
                <button type="button" className="btn btn-sm btn-soft" onClick={() => setConfirming(false)}>{t("common.cancel")}</button>
                <button type="button" className="btn btn-sm btn-soft" style={{ color: "var(--fy-down)" }} disabled={market.busy}
                  onClick={() => { setConfirming(false); market.onRemove(ext.id); }}><IconTrash size={15} />{t("market.removeConfirm")}</button>
              </div>
            </div>
          )}
          {entry && <InstallOutcome entry={entry} market={market} where="installed" />}
        </div>
      </details>
    </li>
  );
}

function MarketCard({ entry, market }: { entry: MarketplaceEntry; market: Market }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const name = localized(lang, entry.name, entry.name_i18n);
  const description = localized(lang, entry.description, entry.description_i18n);
  const version = entry.latest ?? entry.version;
  return (
    <li className="ap-ext">
      <div className="ap-ext-head">
        <span aria-hidden="true" className="ap-ic"><IconPuzzle size={22} /></span>
        <div className="ap-ext-title">
          <h3>{name}</h3>
          <p className="sub ellipsis">{description}</p>
        </div>
      </div>
      {entry.tags.length > 0 && (
        <ul className="ap-chips" aria-label={t("market.tags")}>
          {entry.tags.map((tag) => <li key={tag} className="ap-tag">{tag}</li>)}
        </ul>
      )}
      {entry.error && <p className="app-note is-down">{entry.errorCode === "githubAccess" ? t("market.githubAccess") : entry.error}</p>}
      <div className="ap-foot">
        {version && (
          <span className="ap-tag" data-tip={entry.installed && entry.version ? t("market.installedTip", { version: entry.version }) : t("market.latestTip")}>{version}</span>
        )}
        {entry.homepage && (
          <a className="bd-ib" href={entry.homepage} target="_blank" rel="noopener noreferrer" aria-label={t("market.site")} data-tip={host(entry.homepage)}>
            <IconExternal size={16} />
          </a>
        )}
        <span className="grow" />
        <InstallControl entry={entry} market={market} where="catalog" />
      </div>
      <InstallOutcome entry={entry} market={market} where="catalog" />
    </li>
  );
}

/** Framework update (fyso-update): one commit from a clean worktree; conflicts abort. */
function FrameworkCard() {
  const { t } = useTranslation();
  const s = useStore();
  const update = useDaguAction<UpdateResult>(s.backend, DAGS.update, "result", { loadLast: true });
  const [ref, setRef] = useState("main");
  const [src, setSrc] = useState("");
  const framework = s.project.data?.framework;
  const result = update.phase === "ok" ? update.output : undefined;
  const busy = update.phase === "running";
  const onRun = async () => {
    if (await update.start({ REF: ref.trim(), SRC: src.trim() })) s.reload();
  };
  return (
    <section aria-label={t("update.title")}>
      <h2 className="ap-cap">{t("update.title")}</h2>
      <div className="ap-ext">
        <div className="ap-ext-head">
          <span aria-hidden="true" className="ap-ic"><IconLayers size={22} /></span>
          <div className="ap-ext-title">
            <h3>{t("update.title")}</h3>
            <p className="sub mono ellipsis" data-tip={t("update.srcTip")}>{framework?.src ?? "—"}</p>
          </div>
          <span className="ap-tag" data-tip={t("update.versionTip")}>{framework?.commit ?? t("update.unknown")}</span>
        </div>
        <div className="card action">
          <div className="action-head">
            <label className="grow field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <span className="label" data-tip={t("update.refTip")}>{t("update.ref")}</span>
              <input className="input mono" style={{ flex: 1, minWidth: 0 }} value={ref} autoComplete="off" spellCheck={false}
                disabled={busy} onChange={(e) => setRef(e.target.value)} />
            </label>
            <ActionStatus action={update as Action<unknown>} />
            <ActionButton action={update as Action<unknown>} label={t("update.run")} busyLabel={t("update.running")} onRun={() => void onRun()} />
          </div>
          <details>
            <summary className="mute">{t("update.advanced")}</summary>
            <input className="input mono" style={{ marginTop: 8, width: "100%" }} value={src} autoComplete="off" spellCheck={false}
              aria-label={t("update.src")} placeholder={t("update.srcPlaceholder")} disabled={busy} onChange={(e) => setSrc(e.target.value)} />
          </details>
          {result && (
            <output className="block">{result.changed
              ? t("update.done", { from: result.from, to: result.to, commit: result.commit })
              : t("update.current", { to: result.to })}</output>
          )}
          <ActionError action={update as Action<unknown>} />
        </div>
      </div>
    </section>
  );
}

function ExtensionsTab({ market }: { market: Market }) {
  const { t } = useTranslation();
  const s = useStore();
  const [query, setQuery] = useState("");
  const list = s.extensions.data ?? [];
  const data = market.catalog.output;
  const byId = new Map(market.entries.map((e) => [e.id, e]));
  const q = query.trim().toLowerCase();
  const shown = q
    ? market.entries.filter((e) => [e.id, e.name, e.description, ...e.tags].some((v) => v.toLowerCase().includes(q)))
    : market.entries;
  const refreshing = market.catalog.phase === "running";
  const names = data?.catalogs.map((c) => c.name).join(", ");
  return (
    <div role="tabpanel" id="apps-panel-ext" aria-labelledby="apps-tab-ext">
      <section aria-label={t("ext.title")}>
        <h2 className="ap-cap">{t("ext.installedTitle")} {s.extensions.status === "ok" && <span className="n">{list.length}</span>}</h2>
        {market.remove.phase === "ok" && market.remove.output && (
          <output className="block">{t("market.removed", { id: market.remove.output.id, commit: market.remove.output.commit })}</output>
        )}
        {market.removing && <ActionError action={market.remove as Action<unknown>} />}
        {s.extensions.status === "loading" ? (
          <TileSkeleton />
        ) : s.extensions.status === "error" ? (
          <div role="alert" className="banner banner-down">
            <p className="grow"><strong style={{ color: "var(--fy-down)" }}>{t("common.loadError", { what: "extensions.json" })}</strong> {s.extensions.error}</p>
          </div>
        ) : list.length > 0 ? (
          <ul className="ap-grid wide">{list.map((e) => <ExtensionCard key={e.id} ext={e} entry={byId.get(e.id)} market={market} />)}</ul>
        ) : (
          <p className="ap-empty"><strong>{t("ext.emptyTitle")}</strong> <span className="mute">{t("ext.emptyHint")}</span></p>
        )}
      </section>

      <section aria-label={t("market.title")}>
        <div className="ap-cat-head">
          <h2 className="ap-cap">{t("market.catalogTitle")} {data && <span className="n">{data.extensions.length}</span>}</h2>
          <span className="grow" />
          {market.entries.length > 0 && (
            <label className="ap-search">
              <IconSearch size={16} />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("market.search")} aria-label={t("market.searchLabel")} />
            </label>
          )}
          <button type="button" className="bd-ib tip-r" disabled={refreshing} aria-label={refreshing ? t("market.refreshing") : t("market.refresh")}
            data-tip={refreshing ? t("market.refreshing") : names ? t("market.refreshTip", { names }) : t("market.refresh")} onClick={() => void market.catalog.start()}>
            {refreshing ? <Spinner size={16} /> : <IconRefresh size={18} />}
          </button>
        </div>
        <ActionError action={market.catalog as Action<unknown>} />
        {data?.catalogs.filter((c) => c.error).map((c) => (
          <div key={c.source} role="alert" className="banner banner-down">
            <p className="grow">{t("market.catalogError", { name: c.name, error: c.errorCode === "githubAccess" ? t("market.githubAccess") : c.error })}</p>
          </div>
        ))}
        {!data ? (
          <p className="ap-empty mute">{t("market.never")}</p>
        ) : market.entries.length === 0 ? (
          <p className="ap-empty mute">{t("market.empty")}</p>
        ) : shown.length === 0 ? (
          <p className="ap-empty mute">{t("market.noMatch")}</p>
        ) : (
          <ul className="ap-grid wide">{shown.map((e) => <MarketCard key={e.id} entry={e} market={market} />)}</ul>
        )}
      </section>

      <FrameworkCard />

      <details className="ap-term">
        <summary><IconTerminal size={16} />{t("market.terminal")}</summary>
        <div className="ap-term-body">
          <CopyLine text={t("market.hintCommand")} />
          <CopyLine text="mise run ext:update" />
          <CopyLine text="mise run ext:remove <id>" />
          <CopyLine text="mise run secrets" />
          <CopyLine text="mise run down && mise run up" />
        </div>
      </details>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export function Apps({ tab }: { tab: AppsTab }) {
  const { t } = useTranslation();
  const market = useMarket();
  const updates = market.entries.filter((e) => e.update).length;
  const tabs: { id: AppsTab; label: string; Icon: typeof IconPuzzle }[] = [
    { id: "open", label: t("apps.tabOpen"), Icon: IconArrowUpRight },
    { id: "ext", label: t("apps.tabExt"), Icon: IconPuzzle },
    { id: "skills", label: t("apps.tabSkills"), Icon: IconLayers },
  ];
  const s = useStore();
  const toReview = (s.skills.data ?? []).filter((k) => k.state !== "ready").length;
  return (
    <main className="page page-wide ap-page">
      <div className="ap-head">
        <h1>{t("apps.title")}</h1>
        <span className="bd-ib" tabIndex={0} aria-label={t("apps.subtitle")} data-tip={t("apps.subtitle")}><IconInfo size={16} /></span>
        <span className="grow" />
        <div className="ap-tabs" role="tablist" aria-label={t("apps.title")}>
          {tabs.map(({ id, label, Icon }) => (
            <button key={id} type="button" role="tab" id={`apps-tab-${id}`} aria-controls={`apps-panel-${id}`} aria-selected={tab === id} onClick={() => go(href.appsTab(id))}>
              <Icon size={16} />{label}
              {id === "ext" && updates > 0 && (
                <span className="ap-count" data-tip={t("apps.updates", { count: updates })}>{updates}<span className="sr-only"> {t("apps.updates", { count: updates })}</span></span>
              )}
              {id === "skills" && toReview > 0 && (
                <span className="ap-count" data-tip={t("skills.toReview", { count: toReview })}>{toReview}<span className="sr-only"> {t("skills.toReview", { count: toReview })}</span></span>
              )}
            </button>
          ))}
        </div>
      </div>
      {tab === "open" ? <OpenTab /> : tab === "skills" ? <SkillsTab /> : <ExtensionsTab market={market} />}
    </main>
  );
}
