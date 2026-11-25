import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { LANGS, setLanguage, localized } from "../lib/i18n";
import type { App, Extension } from "../api/types";
import type { Route } from "../lib/router";
import { href } from "../lib/router";
import type { Theme } from "../lib/theme";
import { useStore, type Store } from "../store";
import { useExtensionBadges } from "../lib/extensionBadges";
import { useExtensionVisibility } from "../lib/extensionVisibility";
import { AppIcon, IconApps, IconBot, IconChecklist, IconExternal, IconMoon, IconPlug, IconSidebar, IconSun, IconUsage } from "./Icons";
import { External } from "./ui";
import { SessionMenu } from "./SessionMenu";
import markUrl from "../assets/brand/fyso-mark.png";
import markWhiteUrl from "../assets/brand/fyso-mark-white.png";
import { InstanceSwitcher } from "./InstanceSwitcher";

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

export function TopBar(props: ThemeProps & { route: Route; visible: (id: string) => boolean; navCollapsed: boolean; toggleNav: () => void }) {
  const { t, i18n } = useTranslation();
  const { project, apps, extensions } = useStore();
  const p = project.data;
  const edition = extensions.data?.some((ext) => ext.id === "biz") ? "pro" : "free";
  const embedded = (id: string) => !!apps.data?.some((app) => app.id === id && app.enabled && app.embed);
  const route = props.route;
  const openApp = route.name === "app" && props.visible(`app:${route.id}`) ? apps.data?.find((app) => app.id === route.id && app.enabled && app.embed) : undefined;
  return (
    <header className="topbar">
      <button type="button" className="icon-btn nav-toggle only-desktop" onClick={props.toggleNav} aria-expanded={!props.navCollapsed}
              aria-label={props.navCollapsed ? t("nav.expand") : t("nav.collapse")} title={props.navCollapsed ? t("nav.expand") : t("nav.collapse")}>
        <IconSidebar size={18} />
      </button>
      <a className="brand" href={href.setup}>
        {/* The Fyso mark from the design system; the project name sits beside it. */}
        {p?.brand?.icon ? <img className="logo logo-custom" src={p.brand.icon} alt="" width={28} height={28} /> : <>
          <img className="logo logo-on-light" src={markUrl} alt="" width={28} />
          <img className="logo logo-on-dark" src={markWhiteUrl} alt="" width={28} />
        </>}
        <span className="brand-name">{p?.brand?.name ?? p?.name ?? t("top.logo")}</span>
        {extensions.data && <span className={`edition-badge edition-${edition}`}>{t(`top.edition.${edition}`)}</span>}
      </a>
      <InstanceSwitcher />
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
      {p && props.visible("app:omb") && openApp?.id !== "omb" && (embedded("omb") ? (
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

const mcpItem: NavItem = { id: "mcp", href: href.mcp, icon: IconPlug, label: "MCP" };

const extensionItems = (extensions:Extension[],lang:string,shown:(ext:string,page:string,conditional:boolean)=>boolean):NavItem[] => extensions.flatMap(ext=>(ext.pages??[]).filter(page=>shown(ext.id,page.id,!!page.visible)).map(page=>{
  // Existing Biz installs register the overview with the generic workflow icon.
  const icon = ext.id === "biz" && page.id === "overview" && page.icon === "workflow"
    ? "briefcase"
    : page.icon ?? "apps";
  return {
    id: `extension:${ext.id}:${page.id}`,
    href: href.extension(ext.id,page.id),
    label: localized(lang,page.name,page.name_i18n),
    icon: ({size = 18}) => icon.startsWith(`/extensions/${ext.id}/panel/`)
      ? <img src={icon} alt="" width={size} height={size} style={{objectFit:"contain"}} />
      : <AppIcon name={icon} size={size} />,
  };
}));
function section(r:Route) {
  if(r.name === "extension")return `extension:${r.extensionId}:${r.pageId}`;
  if(r.name === "app")return `app:${r.id}`;
  return r.name === "bot" ? "bots" : r.name;
}

/** Apps that open inside the panel (D92) get their own menu entries, after the panel's sections. */
const appItems = (apps:App[],lang:string):NavItem[] => apps.filter(app=>app.enabled&&app.embed).map(app=>({id:`app:${app.id}`,href:href.app(app.id),label:localized(lang,app.name,app.name_i18n),icon:(p:{size?:number})=><AppIcon name={app.icon} size={p.size} />}));

export function SideNav({ route, collapsed, visible, showMcp }: { route: Route; collapsed: boolean; showMcp: boolean; visible: (id: string) => boolean }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const apps = appItems(s.apps.data ?? [], i18n.language).filter(({ id }) => visible(id));
  const shown = useExtensionVisibility(s.extensions.data ?? [], !s.mock);
  const items = [...ITEMS,...(showMcp ? [mcpItem] : []),...apps,...extensionItems(s.extensions.data??[],i18n.language,shown)].filter(({ id }) => visible(id));
  const firstApp = apps[0]?.id;
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
    ...Object.fromEntries((s.apps.data ?? []).map((app) => [`app:${app.id}`, s.health[app.id] === "down"])),
  };
  return (
    <nav aria-label={t("nav.label")} className={`sidenav${collapsed ? " collapsed" : ""}`}>
      {items.map(({ id, href: h, icon: Icon, label }) => {
        const name = label ?? t(`nav.${id}`);
        return (
          <a key={id} href={h} aria-current={section(route) === id ? "page" : undefined}
             data-first-app={id === firstApp || undefined}
             {...(collapsed ? { "data-tip": name, className: "tip-side", "aria-label": name } : {})}>
            <span className="nav-icon"><Icon size={18} />{attention[id] && <span className="nav-dot" aria-hidden="true" />}</span>
            <span className="grow nav-label" aria-hidden={collapsed || undefined}><span className="bottomnav-label">{name}</span></span>
            <span className="nav-extra" aria-hidden={collapsed || undefined}>{counts[id] ?? (attention[id] ? <span className="nav-count" style={{ color: "var(--fy-warn)", fontWeight: 700 }}>!<span className="sr-only"> {t("apps.downFlag")}</span></span> : null)}</span>
          </a>
        );
      })}
    </nav>
  );
}

/** Wide or collapsed is the person's choice, remembered in this browser; wide by default. */
export function useNavCollapsed(): [boolean, () => void] {
  const read = () => { try { return localStorage.getItem("fy-nav-collapsed") === "1"; } catch { return false; } };
  const [collapsed, setCollapsed] = useState<boolean>(read);
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem("fy-nav-collapsed", next ? "1" : "0"); } catch { /* the choice lasts this visit */ }
  };
  return [collapsed, toggle];
}

export function BottomNav({ route, visible, showMcp }: { route: Route; showMcp: boolean; visible: (id: string) => boolean }) {
  const { t, i18n } = useTranslation();
  const s = useStore();
  const shown = useExtensionVisibility(s.extensions.data ?? [], !s.mock);
  const items = [...ITEMS,...(showMcp ? [mcpItem] : []),...extensionItems(s.extensions.data??[],i18n.language,shown)].filter(({ id }) => visible(id));
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
