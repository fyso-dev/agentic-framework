// Apps launcher: framework apps (Dagu, OpenMausBot) and the project's own apps, with health.
import { useTranslation } from "react-i18next";
import type { App, Health } from "../api/types";
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

export function Apps() {
  const { t } = useTranslation();
  const s = useStore();
  const apps = s.apps.data ?? [];
  const groups: { id: App["group"]; title: string; apps: App[] }[] = [
    { id: "framework", title: t("apps.framework"), apps: apps.filter((a) => a.group === "framework") },
    { id: "project", title: s.project.data?.name ?? t("apps.project"), apps: apps.filter((a) => a.group === "project") },
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
      ))}
    </main>
  );
}
