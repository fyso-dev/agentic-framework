// Apps launcher: framework apps (Dagu, OpenMausBot), the project's own apps and the
// apps added by extensions, with health. Installed extensions are listed read-only
// (docs/extensions-contract.md §5); the marketplace (§8) installs and upgrades them
// through the fyso-ext-catalog and fyso-ext-install workflows. Removing stays a terminal task.
// The framework itself is updated through fyso-update.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DAGS, type App, type ExtInstallResult, type UpdateResult, type Extension, type Health, type Marketplace as Catalog, type MarketplaceEntry } from "../api/types";
import { ActionButton, ActionError, ActionStatus } from "../components/Action";
import { AppIcon, Spinner } from "../components/Icons";
import { CopyLine, External } from "../components/ui";
import { localized } from "../lib/i18n";
import { useDaguAction, type Action } from "../lib/useDaguAction";
import { useStore } from "../store";

const host = (url: string) => {
  try {
    return new URL(url, location.href).host;
  } catch {
    return url;
  }
};

function HealthLabel({ health }: { health: Health }) {
  const { t } = useTranslation();
  if (health === "ok")
    return (
      <span className="dot-label">
        <span aria-hidden="true" className="dot" />
        {t("apps.health.ok")}
      </span>
    );
  const [cls, glyph] = health === "down" ? ["pill-down pill-surface", "×"] : ["pill-unk", "?"];
  return (
    <span className={`pill ${cls}`} style={health === "down" ? { color: "var(--down)" } : undefined}>
      <span aria-hidden="true" className="glyph">{glyph}</span>
      {t(`apps.health.${health}`)}
    </span>
  );
}

function AppRow({ app }: { app: App }) {
  const { t, i18n } = useTranslation();
  const { health } = useStore();
  const lang = i18n.language;
  const h: Health = health[app.id] ?? "unknown";
  const name = localized(lang, app.name, app.name_i18n);
  const description = localized(lang, app.description, app.description_i18n);
  const note = app.accessNote ? localized(lang, app.accessNote, app.accessNote_i18n) : undefined;
  const down = app.enabled && h === "down";
  const inner = (
    <>
      <span aria-hidden="true" className="app-icon"><AppIcon name={app.icon} /></span>
      <div style={{ flex: "1 1 auto", minWidth: 0 }}>
        <p className="ellipsis"><strong>{name}</strong> <span className="mute">· {description}</span></p>
        {down ? (
          <p className="app-note is-down">{t("apps.downDetail")}</p>
        ) : note ? (
          <p className="app-note">{note}</p>
        ) : null}
        <p className="app-note only-mobile mono">{host(app.url)}</p>
      </div>
      <span className="app-host ellipsis">{host(app.url)}</span>
      <span className="app-health">
        {app.enabled ? <HealthLabel health={h} /> : (
          <span className="pill pill-unk"><span aria-hidden="true" className="glyph">○</span>{t("apps.off")}</span>
        )}
      </span>
      <span className="app-open" style={app.enabled ? undefined : { color: "var(--mute)" }}>
        {app.enabled ? <>{t("apps.open")} <span aria-hidden="true">↗</span></> : t("apps.off")}
      </span>
    </>
  );
  return (
    <li>
      {app.enabled ? (
        <a className={`row app-row${down ? " is-down" : ""}`} href={app.url} target="_blank" rel="noopener noreferrer">
          {inner}
          <span className="sr-only">{t(`apps.health.${h}`)} · {t("common.newTab")}</span>
        </a>
      ) : (
        <div className="row app-row is-off" aria-disabled="true">{inner}</div>
      )}
    </li>
  );
}

function Skeleton() {
  return (
    <ul className="card list" aria-hidden="true">
      {[0, 1].map((i) => (
        <li key={i} className="row app-row fy-sk">
          <span className="skel" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span className="grow" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="skel" style={{ width: "40%", height: 10 }} />
            <span className="skel" style={{ width: "25%", height: 8 }} />
          </span>
          <span className="skel" style={{ width: 64, height: 30, borderRadius: 999 }} />
        </li>
      ))}
    </ul>
  );
}

function ExtensionRow({ ext }: { ext: Extension }) {
  const { t, i18n } = useTranslation();
  const missing = ext.secrets.filter((x) => x.required && !x.set);
  const parts = [
    ext.mcpServers.length > 0 && t("ext.mcp", { count: ext.mcpServers.length }),
    ext.workflows.length > 0 && t("ext.workflows", { count: ext.workflows.length }),
    ext.skills.length > 0 && t("ext.skills", { count: ext.skills.length }),
  ].filter(Boolean);
  return (
    <li className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <p className="grow ellipsis">
          <strong className="mono">{ext.id}</strong>{" "}
          <span className="mute">· {ext.version ?? t("ext.noVersion")} · <span className="mono">{ext.src}</span></span>
        </p>
        {missing.length > 0 ? (
          <span className="pill pill-down"><span aria-hidden="true" className="glyph">×</span>{t("ext.missing", { count: missing.length })}</span>
        ) : (
          <span className="pill pill-ok"><span aria-hidden="true" className="glyph">✓</span>{t("ext.ready")}</span>
        )}
      </div>
      {parts.length > 0 && <p className="mute">{parts.join(" · ")}</p>}
      {ext.secrets.length > 0 && (
        <ul className="chips" aria-label={t("ext.secrets")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {ext.secrets.map((x) => {
            const desc = x.description ? localized(i18n.language, x.description, x.description_i18n) : undefined;
            const state = x.set ? t("ext.secretSet") : x.required ? t("ext.secretMissing") : t("ext.secretOptional");
            return (
              <li key={x.name} className={`chip mono ${x.set ? "ok" : x.required ? "bad" : ""}`} title={desc}>
                {x.name} <span className="sr-only">{state}</span><span aria-hidden="true">{x.set ? " ✓" : x.required ? " ×" : " ○"}</span>
              </li>
            );
          })}
        </ul>
      )}
      {missing.length > 0 && <CopyLine text="mise run secrets" />}
    </li>
  );
}

function Extensions() {
  const { t } = useTranslation();
  const s = useStore();
  const list = s.extensions.data ?? [];
  return (
    <section aria-label={t("ext.title")} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 className="section-title">{t("ext.title")} {s.extensions.status === "ok" && <span>{list.length}</span>}</h2>
      {s.extensions.status === "loading" ? (
        <Skeleton />
      ) : s.extensions.status === "error" ? (
        <div role="alert" className="banner banner-down">
          <p className="grow"><strong style={{ color: "var(--down)" }}>{t("common.loadError", { what: "extensions.json" })}</strong> {s.extensions.error}</p>
        </div>
      ) : list.length > 0 ? (
        <>
          <ul className="card list">{list.map((e) => <ExtensionRow key={e.id} ext={e} />)}</ul>
          <p className="mute">{t("ext.manage")}</p>
          <CopyLine text="mise run ext:update" />
        </>
      ) : (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 18 }}>
          <p><strong>{t("ext.emptyTitle")}</strong> <span className="mute">{t("ext.emptyHint")}</span></p>
          <CopyLine text={t("ext.emptyCommand")} />
        </div>
      )}
    </section>
  );
}

function MarketRow({ entry, install, target, onInstall }: {
  entry: MarketplaceEntry;
  install: Action<ExtInstallResult>;
  target: string | null;
  onInstall: (entry: MarketplaceEntry) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const mine = target === entry.id;
  const busy = install.phase === "running";
  const name = localized(lang, entry.name, entry.name_i18n);
  const description = localized(lang, entry.description, entry.description_i18n);
  let control;
  if (mine && busy) {
    control = (
      <span className="action-status is-running" role="status">
        <Spinner />{entry.installed ? t("market.updating") : t("market.installing")}
      </span>
    );
  } else if (!entry.latest) {
    control = <span className="pill pill-unk">{t("market.noTags")}</span>;
  } else if (entry.installed && !entry.update) {
    control = <span className="pill pill-ok"><span aria-hidden="true" className="glyph">✓</span>{t("market.installed", { version: entry.version ?? "" })}</span>;
  } else {
    control = (
      <button type="button" className={`btn ${entry.update ? "btn-ghost" : "btn-pri"}`} disabled={busy} onClick={() => onInstall(entry)}>
        {entry.update ? t("market.update", { version: entry.latest }) : t("market.install", { version: entry.latest })}
      </button>
    );
  }
  return (
    <li className="row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div className="grow" style={{ minWidth: 0 }}>
          <p className="ellipsis"><strong>{name}</strong> <span className="mute">· {description}</span></p>
          <p className="mute ellipsis">
            <span className="mono">{entry.id}</span> · {t("market.from", { catalog: entry.catalog })}
            {entry.homepage && <> · <External href={entry.homepage}>{host(entry.homepage)}</External></>}
          </p>
        </div>
        {control}
      </div>
      {entry.tags.length > 0 && (
        <ul className="chips" aria-label={t("market.tags")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {entry.tags.map((tag) => <li key={tag} className="chip">{tag}</li>)}
        </ul>
      )}
      {entry.error && <p className="app-note is-down">{entry.error}</p>}
      {mine && <ActionError action={install as Action<unknown>} />}
      {mine && install.phase === "ok" && install.output && (
        <div role="status" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <p className="mute">{t("market.done", { id: install.output.id, version: install.output.version ?? "", commit: install.output.commit })}</p>
          <CopyLine text="mise run secrets" />
        </div>
      )}
    </li>
  );
}

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

function Market() {
  const { t } = useTranslation();
  const s = useStore();
  const catalog = useDaguAction<Catalog>(s.backend, DAGS.extCatalog, "catalog", { loadLast: true });
  const install = useDaguAction<ExtInstallResult>(s.backend, DAGS.extInstall, "result");
  const [target, setTarget] = useState<string | null>(null);
  const data = catalog.output;
  // Install state comes from extensions.json (always current), not from the last catalog read.
  const local = new Map((s.extensions.data ?? []).map((e) => [e.id, e.version]));
  const entries = (data?.extensions ?? []).map((e): MarketplaceEntry => {
    if (s.extensions.status !== "ok") return e;
    const version = local.get(e.id) ?? null;
    return { ...e, installed: local.has(e.id), version, update: local.has(e.id) && newer(e.latest, version) };
  });
  const onInstall = async (entry: MarketplaceEntry) => {
    setTarget(entry.id);
    const result = await install.start({ ID: entry.id, MODE: entry.installed ? "update" : "add" });
    if (result) {
      s.reload();
      void catalog.start();
    }
  };
  return (
    <section aria-label={t("market.title")} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 className="section-title">{t("market.title")} {data && <span>{data.extensions.length}</span>}</h2>
      <div className="card action">
        <div className="action-head">
          <p className="grow mute ellipsis">
            {data ? t("market.catalogs", { names: data.catalogs.map((c) => c.name).join(", ") }) : t("market.never")}
          </p>
          <ActionStatus action={catalog as Action<unknown>} />
          <ActionButton action={catalog as Action<unknown>} label={t("market.refresh")} busyLabel={t("market.refreshing")} onRun={() => void catalog.start()} />
        </div>
        <ActionError action={catalog as Action<unknown>} />
      </div>
      {data?.catalogs.filter((c) => c.error).map((c) => (
        <div key={c.source} role="alert" className="banner banner-down">
          <p className="grow">{t("market.catalogError", { name: c.name, error: c.error })}</p>
        </div>
      ))}
      {data && (entries.length > 0 ? (
        <ul className="card list">
          {entries.map((e) => <MarketRow key={e.id} entry={e} install={install} target={target} onInstall={onInstall} />)}
        </ul>
      ) : (
        <p className="mute">{t("market.empty")}</p>
      ))}
      <p className="mute">{t("market.hint")}</p>
      <CopyLine text={t("market.hintCommand")} />
    </section>
  );
}

/** Framework update (fyso-update): one commit from a clean worktree; conflicts abort. */
function FrameworkUpdate() {
  const { t } = useTranslation();
  const s = useStore();
  const update = useDaguAction<UpdateResult>(s.backend, DAGS.update, "result", { loadLast: true });
  const [ref, setRef] = useState("main");
  const [src, setSrc] = useState("");
  const commit = s.project.data?.framework?.commit;
  const result = update.phase === "ok" ? update.output : undefined;
  const onRun = async () => {
    if (await update.start({ REF: ref.trim(), SRC: src.trim() })) s.reload();
  };
  return (
    <section aria-label={t("update.title")} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 className="section-title">{t("update.title")}</h2>
      <div className="card action">
        <div className="action-head">
          <p className="grow mute ellipsis">{commit ? t("update.version", { commit }) : t("update.unknown")}</p>
          <ActionStatus action={update as Action<unknown>} />
          <ActionButton action={update as Action<unknown>} label={t("update.run")} busyLabel={t("update.running")} onRun={() => void onRun()} />
        </div>
        <div className="field">
          <label className="label" htmlFor="update-ref">{t("update.ref")} <span>· {t("update.refHint")}</span></label>
          <input id="update-ref" className="input" value={ref} autoComplete="off" spellCheck={false}
            disabled={update.phase === "running"} onChange={(e) => setRef(e.target.value)} />
        </div>
        <details>
          <summary className="mute">{t("update.advanced")}</summary>
          <div className="field" style={{ marginTop: 8 }}>
            <label className="label" htmlFor="update-src">{t("update.src")} <span>· {t("update.srcHint")}</span></label>
            <input id="update-src" className="input" value={src} autoComplete="off" spellCheck={false}
              placeholder={s.project.data?.framework?.src ?? ""} disabled={update.phase === "running"} onChange={(e) => setSrc(e.target.value)} />
          </div>
        </details>
        {result && (
          <p role="status">{result.changed
            ? t("update.done", { from: result.from, to: result.to, commit: result.commit })
            : t("update.current", { to: result.to })}</p>
        )}
        <ActionError action={update as Action<unknown>} />
      </div>
      <p className="mute">{t("update.hint")}</p>
      <CopyLine text={t("update.hintCommand")} />
    </section>
  );
}

export function Apps() {
  const { t } = useTranslation();
  const s = useStore();
  const apps = s.apps.data ?? [];
  const groups: { id: App["group"]; title: string; apps: App[] }[] = [
    { id: "framework", title: t("apps.framework"), apps: apps.filter((a) => a.group === "framework") },
    { id: "project", title: s.project.data?.name ?? t("apps.project"), apps: apps.filter((a) => a.group === "project") },
    { id: "extension", title: t("apps.extension"), apps: apps.filter((a) => a.group === "extension") },
  ];
  return (
    <main className="page page-wide">
      <div className="page-head">
        <div>
          <h1>{t("apps.title")}</h1>
          <p>{t("apps.subtitle")}</p>
        </div>
      </div>
      {s.apps.status === "error" && (
        <div role="alert" className="banner banner-down">
          <p className="grow"><strong style={{ color: "var(--down)" }}>{t("common.loadError", { what: "apps.json" })}</strong> {s.apps.error}</p>
          <button type="button" className="btn btn-ghost" onClick={s.reload}>{t("common.retry")}</button>
        </div>
      )}
      {groups.map((g) => (
        <section key={g.id} aria-label={g.title} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="section-title">{g.title} {s.apps.status === "ok" && <span>{g.apps.length}</span>}</h2>
          {s.apps.status === "loading" ? (
            <Skeleton />
          ) : g.apps.length > 0 ? (
            <ul className="card list">{g.apps.map((a) => <AppRow key={a.id} app={a} />)}</ul>
          ) : g.id === "project" && s.apps.status === "ok" ? (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 18 }}>
              <p><strong>{t("apps.emptyTitle")}</strong> <span className="mute">{t("apps.emptyHint")}</span></p>
              <CopyLine text={t("apps.emptyCommand")} />
            </div>
          ) : null}
        </section>
      )).filter((_, i) => i < 2 || groups[i].apps.length > 0)}
      <Extensions />
      <Market />
      <FrameworkUpdate />
    </main>
  );
}
