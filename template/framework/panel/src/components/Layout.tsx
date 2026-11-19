import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LANGS, setLanguage, localized } from "../lib/i18n";
import type { Extension } from "../api/types";
import type { Route } from "../lib/router";
import { href } from "../lib/router";
import type { Theme } from "../lib/theme";
import { useStore, type Store } from "../store";
import { useExtensionBadges } from "../lib/extensionBadges";
import { AppIcon, IconApps, IconBot, IconChecklist, IconExternal, IconMoon, IconPlug, IconSidebar, IconSun, IconUsage } from "./Icons";
import { External } from "./ui";
import { SessionMenu } from "./SessionMenu";
import markUrl from "../assets/brand/fyso-mark.png";
import markWhiteUrl from "../assets/brand/fyso-mark-white.png";

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

/** What extension pages marked as needing attention are counting, e.g. "Pendientes: 3". */
function Attention() {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const extensions = s.extensions.data ?? [];
  const badges = useExtensionBadges(extensions, !s.mock);
  return (
    <>
      {extensions.flatMap((ext) =>
        (ext.pages ?? []).filter((page) => page.badge?.attention).map((page) => {
          const badge = badges[`extension:${ext.id}:${page.id}`];
          if (!badge || badge.count === 0) return null;
          return (
            <a key={`${ext.id}:${page.id}`} href={href.extension(ext.id, page.id)} role="status" className={`state-pill pill-${badge.warn ? "warn" : "unk"} attention-pill`}>
              <span aria-hidden="true" className="glyph">!</span>
              {t("top.attention", { name: localized(i18n.language, page.name, page.name_i18n), count: badge.count })}
            </a>
          );
        }),
      )}
    </>
  );
}

export function TopBar(props: ThemeProps & { route: Route }) {
  const { t, i18n } = useTranslation();
  const { project, apps } = useStore();
  const p = project.data;
  const embedded = (id: string) => !!apps.data?.some((app) => app.id === id && app.enabled && app.embed);
  const route = props.route;
  const openApp = route.name === "app" ? apps.data?.find((app) => app.id === route.id && app.enabled && app.embed) : undefined;
  return (
    <header className="topbar">
      <a className="brand" href={href.setup}>
        {/* The Fyso mark from the design system; the project name sits beside it. */}
        <img className="logo logo-on-light" src={markUrl} alt="" width={28} />
        <img className="logo logo-on-dark" src={markWhiteUrl} alt="" width={28} />
        <span className="brand-name">{p?.name ?? t("top.logo")}</span>
      </a>
      {openApp && (
        <span className="crumb">
          <span className="crumb-sep" aria-hidden="true">/</span>
          <span className="crumb-name">{localized(i18n.language, openApp.name, openApp.name_i18n)}</span>
          <a className="icon-btn tip-r" href={openApp.url} target="_blank" rel="noopener noreferrer"
             data-tip={t("top.openInTab")} aria-label={`${t("top.openInTab")} ${t("common.newTab")}`}>
            <IconExternal size={16} />
          </a>
        </span>
      )}
      {p && <span className="env-badge only-desktop">{t(`top.env.${p.env}`, { defaultValue: p.env })}</span>}
      <span className="grow only-desktop" />
      <Attention />
      <GlobalState className="only-desktop" />
      <span className="only-desktop">
        <LangSwitch />
      </span>
      <span className="only-desktop">
        <ThemeButton {...props} />
      </span>
      {p && openApp?.id !== "omb" && (embedded("omb") ? (
        <a href={href.app("omb")} className="btn btn-pri">
          <span className="only-desktop">{t("top.openOmb")}</span>
          <span className="only-mobile">{t("top.ombShort")}</span>
        </a>
      ) : (
        <External href={p.urls.omb} className="btn btn-pri">
          <span className="only-desktop">{t("top.openOmb")}</span>
          <span className="only-mobile">{t("top.ombShort")}</span>
        </External>
      ))}
      <SessionMenu />
      <MoreMenu {...props} />
    </header>
  );
}

type NavItem = { id:string; href:string; icon:(p:{size?:number})=>ReactNode; label?:string };
const ITEMS: NavItem[] = [
  { id: "setup", href: href.setup, icon: IconChecklist },
  { id: "bots", href: href.bots, icon: IconBot },
  { id: "observability", href: href.observability, icon: IconUsage },
  { id: "connectors", href: href.connectors, icon: IconPlug },
  { id: "apps", href: href.apps, icon: IconApps },
];

const extensionItems = (extensions:Extension[],lang:string):NavItem[] => extensions.flatMap(ext=>(ext.pages??[]).map(page=>({id:`extension:${ext.id}:${page.id}`,href:href.extension(ext.id,page.id),label:localized(lang,page.name,page.name_i18n),icon:(p:{size?:number})=><AppIcon name={page.icon ?? "apps"} size={p.size} />})));
function section(r:Route) {
  if(r.name === "extension")return `extension:${r.extensionId}:${r.pageId}`;
  return r.name === "bot" ? "bots" : r.name === "app" ? "apps" : r.name;
}

export function SideNav({ route }: { route: Route }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const items = [...ITEMS,...extensionItems(s.extensions.data??[],i18n.language)];
  const open = openSteps(s);
  const unapplied = unappliedCount(s);
  const down = downApps(s);
  const badges = useExtensionBadges(s.extensions.data ?? [], !s.mock);
  const counts: Record<NavItem["id"], ReactNode> = {
    ...Object.fromEntries(Object.entries(badges).filter(([, badge]) => badge.count > 0).map(([id, badge]) => [id,
      <span key={id} className="nav-count" style={{ color: badge.warn ? "var(--fy-warn)" : undefined, fontWeight: 700 }}>{badge.count}</span>])),
    connectors: null,
    observability: null,
    setup: loadingSteps(s) ? null : (
      <span className="nav-count" style={{ color: open === 0 ? "var(--fy-ok)" : s.anyFailed ? "var(--fy-down)" : "var(--fy-warn)", fontWeight: 700 }}>
        {s.stepsDone}/{s.stepsTotal}
      </span>
    ),
    bots: unapplied > 0
      ? <span className="pill pill-warn">{t("nav.unapplied", { count: unapplied })}</span>
      : <span className="nav-count">{!s.mock && s.runtimeBots.data ? s.runtimeBots.data.length : s.workingBots.length}</span>,
    apps: down > 0
      ? <span className="nav-count" style={{ color: "var(--fy-warn)", fontWeight: 700 }}>{down} !<span className="sr-only"> {t("nav.appsDown", { count: down })}</span></span>
      : <span className="nav-count">{s.apps.data?.length ?? ""}</span>,
  };
  // Collapsed, the menu keeps only its icons; the names show as tooltips and a dot marks what needs attention.
  const attention: Record<string, boolean> = {
    ...Object.fromEntries(Object.entries(badges).map(([id, badge]) => [id, !!badge.warn && badge.count > 0])),
    setup: !loadingSteps(s) && open > 0, bots: unapplied > 0, apps: down > 0,
  };
  const [collapsed, toggle] = useNavCollapsed(route);
  return (
    <nav aria-label={t("nav.label")} className={`sidenav${collapsed ? " collapsed" : ""}`}>
      {items.map(({ id, href: h, icon: Icon, label }) => {
        const name = label ?? t(`nav.${id}`);
        return (
          <a key={id} href={h} aria-current={section(route) === id ? "page" : undefined}
             {...(collapsed ? { "data-tip": name, className: "tip-side", "aria-label": name } : {})}>
            <span className="nav-icon"><Icon />{collapsed && attention[id] && <span className="nav-dot" aria-hidden="true" />}</span>
            {!collapsed && <span className="grow"><span className="bottomnav-label">{name}</span></span>}
            {!collapsed && counts[id]}
          </a>
        );
      })}
      <button type="button" className="nav-toggle tip-side" onClick={toggle} aria-expanded={!collapsed}
              data-tip={collapsed ? t("nav.expand") : undefined} aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}>
        <span className="nav-icon"><IconSidebar /></span>
        {!collapsed && <span className="grow">{t("nav.collapse")}</span>}
      </button>
    </nav>
  );
}

/** One remembered choice; until the person picks, apps opened in the panel start with the menu collapsed. */
function useNavCollapsed(route: Route): [boolean, () => void] {
  const read = () => { try { const v = localStorage.getItem("fy-nav-collapsed"); return v === null ? null : v === "1"; } catch { return null; } };
  const [pref, setPref] = useState<boolean | null>(read);
  const collapsed = pref ?? route.name === "app";
  const toggle = () => {
    const next = !collapsed;
    setPref(next);
    try { localStorage.setItem("fy-nav-collapsed", next ? "1" : "0"); } catch { /* the choice lasts this visit */ }
  };
  return [collapsed, toggle];
}

export function BottomNav({ route }: { route: Route }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const items = [...ITEMS,...extensionItems(s.extensions.data??[],i18n.language)];
  const open = loadingSteps(s) || s.noData ? 0 : openSteps(s);
  const extensionBadges = useExtensionBadges(s.extensions.data ?? [], !s.mock);
  const badges: Record<NavItem["id"], [number, string]> = {
    ...Object.fromEntries(Object.entries(extensionBadges).map(([id, badge]) => [id, [badge.count, badge.warn ? "badge badge-warn" : "badge"] as [number, string]])),    connectors: [0, "badge"],
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
            <span className="bottomnav-label">{label ?? t(`nav.${id}`)}</span>
            {n > 0 && <span className="sr-only"> ({n})</span>}
          </a>
        );
      })}
    </nav>
  );
}
