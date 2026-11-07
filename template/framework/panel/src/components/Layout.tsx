import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LANGS, setLanguage, localized } from "../lib/i18n";
import type { Extension } from "../api/types";
import type { Route } from "../lib/router";
import { href } from "../lib/router";
import type { Theme } from "../lib/theme";
import { useStore, type Store } from "../store";
import { IconApps, IconBot, IconChecklist, IconMoon, IconSun, IconWorkflow } from "./Icons";
import { External } from "./ui";
import { SessionMenu } from "./SessionMenu";

export type ThemeProps = { theme: Theme; toggleTheme: () => void };

/** Steps that still need someone: pending, failed or never checked. */
export const openSteps = (s: Store) =>
  Object.values(s.steps).filter((v) => v === "pending" || v === "failed" || v === "never").length;

export const unappliedCount = (s: Store) =>
  s.draftChanges > 0 ? s.draftChanges : s.checkData && !s.checkData.bots.ok ? s.checkData.bots.pending : 0;

export const downApps = (s: Store) =>
  (s.apps.data ?? []).filter((a) => a.enabled && s.health[a.id] === "down").length;

const loadingSteps = (s: Store) => Object.values(s.steps).includes("loading");

/** "Proyecto listo" · "2 pasos pendientes" · "Sin datos". */
export function GlobalState({ short = false, className = "" }: { short?: boolean; className?: string }) {
  const { t } = useTranslation();
  const s = useStore();
  if (loadingSteps(s)) return null;
  const open = openSteps(s);
  let tone = "ok", glyph = "✓", text = t("top.ready");
  if (s.noData) [tone, glyph, text] = ["unk", "?", t("top.noData")];
  else if (open > 0) {
    tone = s.anyFailed ? "down" : "warn";
    glyph = "!";
    text = t(short ? "top.pendingShort" : "top.pending", { count: open });
  }
  return (
    <p role="status" className={`${short ? "pill" : "state-pill"} pill-${tone} ${className}`}>
      <span aria-hidden="true" className="glyph">{glyph}</span>
      {text}
    </p>
  );
}

function LangSwitch() {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t("top.language")} className="seg">
      {LANGS.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={i18n.language === l} onClick={() => setLanguage(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function ThemeButton({ theme, toggleTheme }: ThemeProps) {
  const { t } = useTranslation();
  const label = theme === "dark" ? t("top.toLight") : t("top.toDark");
  return (
    <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={label} title={label}>
      {theme === "dark" ? <IconSun /> : <IconMoon />}
    </button>
  );
}

function MoreMenu(props: ThemeProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="only-mobile">
      <button type="button" className="icon-btn" aria-expanded={open} aria-label={t("top.more")} onClick={() => setOpen(!open)}>
        <span aria-hidden="true" style={{ fontSize: 18, fontWeight: 700 }}>⋯</span>
      </button>
      {open && (
        <div className="menu">
          <div className="menu-row">
            <span className="label">{t("top.language")}</span>
            <LangSwitch />
          </div>
          <div className="menu-row">
            <span className="label">{t("top.theme")}</span>
            <ThemeButton {...props} />
          </div>
        </div>
      )}
    </div>
  );
}

export function TopBar(props: ThemeProps) {
  const { t } = useTranslation();
  const { project } = useStore();
  const p = project.data;
  return (
    <header className="topbar">
      <a className="brand" href={href.setup}>
        {/* Logo slot: the product name is provisional, swap this mark freely. */}
        <span className="logo" aria-hidden="true" title={t("top.logo")}>F</span>
        <span className="brand-name">{p?.name ?? t("top.logo")}</span>
      </a>
      {p && <span className="env-badge only-desktop">{t(`top.env.${p.env}`, { defaultValue: p.env })}</span>}
      <span className="grow only-desktop" />
      <GlobalState className="only-desktop" />
      <span className="only-desktop">
        <LangSwitch />
      </span>
      <span className="only-desktop">
        <ThemeButton {...props} />
      </span>
      {p && (
        <External href={p.urls.omb} className="btn btn-md btn-pri">
          <span className="only-desktop">{t("top.openOmb")}</span>
          <span className="only-mobile">{t("top.ombShort")}</span>
        </External>
      )}
      <SessionMenu />
      <MoreMenu {...props} />
    </header>
  );
}

type NavItem = { id:string; href:string; icon:typeof IconBot; label?:string };
const ITEMS: NavItem[] = [
  { id: "setup", href: href.setup, icon: IconChecklist },
  { id: "bots", href: href.bots, icon: IconBot },
  { id: "observability", href: href.observability, icon: IconWorkflow },
  { id: "apps", href: href.apps, icon: IconApps },
];

const extensionItems = (extensions:Extension[],lang:string):NavItem[] => extensions.flatMap(ext=>(ext.pages??[]).map(page=>({id:`extension:${ext.id}:${page.id}`,href:href.extension(ext.id,page.id),label:localized(lang,page.name,page.name_i18n),icon:page.icon === "workflow" ? IconWorkflow : IconApps})));
function section(r:Route) {
  if(r.name === "extension")return `extension:${r.extensionId}:${r.pageId}`;
  return r.name === "bot" ? "bots" : r.name;
}

export function SideNav({ route }: { route: Route }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const items = [...ITEMS,...extensionItems(s.extensions.data??[],i18n.language)];
  const open = openSteps(s);
  const unapplied = unappliedCount(s);
  const down = downApps(s);
  const counts: Record<NavItem["id"], ReactNode> = {

    observability: null,
    setup: loadingSteps(s) ? null : (
      <span className="nav-count" style={{ color: open === 0 ? "var(--ok)" : s.anyFailed ? "var(--down)" : "var(--warn)", fontWeight: 600 }}>
        {s.stepsDone}/4
      </span>
    ),
    bots: unapplied > 0
      ? <span className="pill pill-warn">{t("nav.unapplied", { count: unapplied })}</span>
      : <span className="nav-count">{!s.mock && s.runtimeBots.data ? s.runtimeBots.data.length : s.workingBots.length}</span>,
    apps: down > 0
      ? <span className="nav-count" style={{ color: "var(--warn)", fontWeight: 700 }}>{down} !<span className="sr-only"> {t("nav.appsDown", { count: down })}</span></span>
      : <span className="nav-count">{s.apps.data?.length ?? ""}</span>,
  };
  return (
    <nav aria-label={t("nav.label")} className="sidenav">
      {items.map(({ id, href: h, icon: Icon, label }) => (
        <a key={id} href={h} aria-current={section(route) === id ? "page" : undefined}>
          <Icon />
          <span className="grow">{label ?? t(`nav.${id}`)}</span>
          {counts[id]}
        </a>
      ))}
    </nav>
  );
}

export function BottomNav({ route }: { route: Route }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const items = [...ITEMS,...extensionItems(s.extensions.data??[],i18n.language)];
  const open = loadingSteps(s) || s.noData ? 0 : openSteps(s);
  const badges: Record<NavItem["id"], [number, string]> = {
    observability: [0, "badge"],
    setup: [open, s.anyFailed ? "badge" : "badge badge-warn"],
    bots: [unappliedCount(s), "badge badge-warn"],
    apps: [downApps(s), "badge"],
  };
  return (
    <nav aria-label={t("nav.label")} className="bottomnav" style={{gridTemplateColumns:`repeat(${items.length}, minmax(0, 1fr))`}}>
      {items.map(({ id, href: h, icon: Icon, label }) => {
        const [n, cls] = badges[id] ?? [0,"badge"];
        return (
          <a key={id} href={h} aria-current={section(route) === id ? "page" : undefined}>
            <span className="badge-wrap">
              <Icon size={22} />
              {n > 0 && <span className={cls} aria-hidden="true">{n}</span>}
            </span>
            {label ?? t(`nav.${id}`)}
            {n > 0 && <span className="sr-only"> ({n})</span>}
          </a>
        );
      })}
    </nav>
  );
}
