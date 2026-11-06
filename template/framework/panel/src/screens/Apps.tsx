// Apps launcher: framework apps (Dagu, OpenMausBot), the project's own apps and the
// apps added by extensions, with health. Installed extensions are listed read-only
// (docs/extensions-contract.md §5): installing and upgrading are terminal tasks.
import { useTranslation } from "react-i18next";
import type { App, Extension, Health } from "../api/types";
import { AppIcon } from "../components/Icons";
import { CopyLine } from "../components/ui";
import { localized } from "../lib/i18n";
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
    </main>
  );
}
