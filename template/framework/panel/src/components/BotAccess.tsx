// Connectors tab of the bot detail: everything the bot may use, as cards.
// Three native sources, one vocabulary:
//  - project tools (Dagu MCP through cwd = ${FYSO_ROOT}) → team.yaml draft
//  - MCP servers (ToolScope selectors)                   → team.yaml draft
//  - Composio apps (fyso-app-access plan/apply)          → applied on save
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { connectors, directMcp, type AppCatalog, type ConnectedApps, type NativeServer } from "../api/connectors";
import type { RuntimeBot } from "../api/types";
import { accessFor, selectServer, type ToolScope } from "../lib/connector-access";
import { href } from "../lib/router";
import { base64Utf8 } from "../lib/team";
import { useDaguAction } from "../lib/useDaguAction";
import { useStore } from "../store";
import { ConnectorLogo } from "./ConnectorLogo";
import { IconClose, IconEye, IconFlow, IconPencil, IconPlus, IconShieldCheck } from "./Icons";

export type Level = "off" | "read" | "write";
type Profile = {
  botId: string; revision: string; composio: boolean;
  connectorScopes: { apps: Record<string, "read" | "write"> } | null;
  connectorTools: Record<string, { tools: "*" | string[] }> | null;
};
type Inventory = { servers: { name: string; portable: boolean; enabled: boolean | null; sources: string[] }[] };
export type McpRow = { name: string; label: string; status: string; available: boolean; optional: boolean; server?: NativeServer };

const sameUrl = (a?: string, b?: string) => !!a && !!b && a.replace(/\/$/, "") === b.replace(/\/$/, "");

/** MCP servers the bot could use: native OMB servers, portable project servers and any already selected. */
export function useMcpInventory(scope: ToolScope | undefined, runtime: RuntimeBot | undefined, projectTools: boolean) {
  const s = useStore();
  const inventory = useDaguAction<Inventory>(s.backend, "fyso-bot-architect", "RESULT");
  const [native, setNative] = useState<NativeServer[]>();
  const [failed, setFailed] = useState(false);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (s.mock) { setNative([]); return; }
    let active = true;
    setNative(undefined); setFailed(false);
    void connectors.servers().then((r) => { if (active) setNative(r.servers); }).catch(() => { if (active) setFailed(true); });
    void inventory.start({ OP: "connections" });
    return () => { active = false; };
  }, [request]);

  const rows = new Map<string, McpRow>();
  for (const server of native || []) rows.set(server.name, { name: server.name, label: server.name, status: server.enabled ? "enabled" : "disabled", available: server.enabled, optional: false, server });
  if (inventory.phase === "ok") for (const server of inventory.output?.servers || []) {
    if (server.portable && !server.sources.includes("project/omb-mcp.json"))
      rows.set(server.name, { ...rows.get(server.name), name: server.name, label: server.name, status: projectTools ? "project" : "needsProject", available: projectTools, optional: false });
  }
  for (const preset of directMcp) {
    const existing = native?.find((server) => sameUrl(server.url, preset.url));
    const row = existing && rows.get(existing.name);
    if (row) row.label = preset.label;
  }
  for (const selector of [...scope?.allow || [], ...scope?.deny || []]) {
    const name = /^mcp:([^:]+):/.exec(selector)?.[1];
    if (name && !rows.has(name)) rows.set(name, { name, label: name, status: "unavailable", available: false, optional: false });
  }
  for (const row of rows.values()) {
    row.optional = ["whop", "agentcard"].includes(row.name) || directMcp.some((preset) => sameUrl(row.server?.url, preset.url));
    const server = row.server;
    const blocked = !!server && (!!server.bot && server.bot !== runtime?.id || !!runtime?.id && !!server.offFor?.includes(runtime.id) || !!runtime?.mcpServers && !runtime.mcpServers.includes(row.name));
    if (blocked) { row.status = "blocked"; row.available = false; }
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.label.localeCompare(b.label)),
    loading: inventory.phase === "running" || (!native && !failed),
    failed: failed || inventory.phase === "failed",
    refresh: () => setRequest((v) => v + 1),
  };
}

/** Composio app grants of one live bot, plus the project's catalog and accounts. */
export function useAppAccess(botId: string | undefined) {
  const s = useStore();
  const action = useDaguAction<Profile & { planId?: string; applied?: boolean }>(s.backend, "fyso-app-access", "RESULT");
  const generation = useRef(0);
  const [profile, setProfile] = useState<Profile>();
  const [data, setData] = useState<{ catalog: AppCatalog; accounts: ConnectedApps }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const current = ++generation.current;
    setProfile(undefined);
    if (botId && !s.mock) void action.start({ OP: "read", BOT_ID: botId }).then((r) => { if (current === generation.current && r) setProfile(r); });
    return () => { generation.current++; };
  }, [botId, s.mock]);

  useEffect(() => {
    if (s.mock) { setData({ catalog: { configured: false, cards: [], source: "mock" }, accounts: { configured: false, services: {} } }); return; }
    let active = true;
    void Promise.allSettled([connectors.catalog(), connectors.connected()]).then(([catalog, accounts]) => {
      if (!active) return;
      if (accounts.status === "rejected") { setFailed(true); return; }
      setData({ catalog: catalog.status === "fulfilled" ? catalog.value : { configured: accounts.value.configured, cards: [], source: "unavailable" }, accounts: accounts.value });
    });
    return () => { active = false; };
  }, [s.mock]);

  const level = (slug: string): Level => {
    if (!profile || !profile.composio) return "off";
    if ((profile.connectorScopes && !Object.hasOwn(profile.connectorScopes.apps, slug)) || (profile.connectorTools && !Object.hasOwn(profile.connectorTools, slug))) return "off";
    return profile.connectorScopes?.apps[slug] || "write";
  };
  const card = (slug: string) => data?.catalog.cards.find((c) => c.slug === slug);
  const slugs = [...new Set([
    ...Object.keys(data?.accounts.services || {}).filter((slug) => data?.accounts.services[slug]?.connected),
    ...Object.keys(profile?.connectorScopes?.apps || {}),
    ...Object.keys(profile?.connectorTools || {}),
  ])];

  /** Plan and apply in one step; the unified Save calls this. */
  const save = async (changes: Record<string, Level>): Promise<boolean> => {
    if (!profile || !botId || !Object.keys(changes).length) return true;
    const current = generation.current;
    const plan = await action.start({ OP: "plan", BOT_ID: botId, REVISION: profile.revision, CHANGES_B64: base64Utf8(JSON.stringify(changes)) });
    if (current !== generation.current || !plan?.planId) return false;
    const applied = await action.start({ OP: "apply", PLAN_ID: plan.planId });
    if (current !== generation.current || !applied) return false;
    const fresh = await action.start({ OP: "read", BOT_ID: botId });
    if (current === generation.current && fresh) setProfile(fresh);
    return true;
  };

  return {
    profile, data, failed: failed || action.phase === "failed", busy: action.phase === "running",
    configured: !!data?.accounts.configured, slugs, level, card,
    connected: (slug: string) => !!data?.accounts.services[slug]?.connected,
    label: (slug: string) => card(slug)?.label || slug,
    save,
  };
}
export type AppAccess = ReturnType<typeof useAppAccess>;

type Card = {
  key: string; label: string; sub: string; logo: React.ReactNode; dim?: boolean;
  control: React.ReactNode; remove?: () => void; removeTip: string;
};

export function BotAccess({ scope, onScope, uses, onUses, usesLocked, runtime, botExists, apps, appChanges, onAppChange, mcp }: {
  scope: ToolScope | undefined; onScope: (scope: ToolScope) => void;
  uses: boolean; onUses: (on: boolean) => void; usesLocked: boolean;
  runtime?: RuntimeBot; botExists: boolean;
  apps: AppAccess; appChanges: Record<string, Level>; onAppChange: (slug: string, level: Level) => void;
  mcp: ReturnType<typeof useMcpInventory>;
}) {
  const { t } = useTranslation();
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!picker) return;
    const close = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setPicker(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPicker(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [picker]);

  const appLevel = (slug: string) => appChanges[slug] ?? apps.level(slug);
  const canEditApps = !!apps.profile && !apps.busy;
  const cards: Card[] = [];
  const add: { key: string; label: string; logo: React.ReactNode; onAdd: () => void }[] = [];
  const full = (partial = false) => (
    <span className={`bd-full${partial ? " is-partial" : ""}`} data-tip={t(partial ? "detail.access.partial" : "detail.access.fullTip")} tabIndex={0}>
      <IconShieldCheck size={16} />{t(partial ? "detail.access.partialShort" : "detail.access.full")}
    </span>
  );

  if (uses) cards.push({
    key: "project", label: t("detail.projectTools"), sub: t("detail.projectToolsSub"),
    logo: <span className="bd-logo bd-logo-flow"><IconFlow size={22} /></span>, control: full(),
    remove: usesLocked ? undefined : () => onUses(false), removeTip: usesLocked ? t("form.workflowsLocked") : t("detail.removeAccess"),
  });
  else add.push({ key: "project", label: t("detail.projectTools"), logo: <span className="bd-logo bd-logo-flow"><IconFlow size={22} /></span>, onAdd: () => onUses(true) });

  for (const row of mcp.rows) {
    const access = accessFor(scope, row.name);
    if (access !== "none") cards.push({
      key: `mcp:${row.name}`, label: row.label, sub: t(`botConnectors.status.${row.status}`), dim: !row.available,
      logo: <ConnectorLogo label={row.label} />, control: full(access === "some"),
      remove: () => onScope(selectServer(scope, row.name, false)), removeTip: t("detail.removeAccess"),
    });
    else if (row.available) add.push({ key: `mcp:${row.name}`, label: row.label, logo: <ConnectorLogo label={row.label} />, onAdd: () => onScope(selectServer(scope, row.name, true)) });
  }

  for (const slug of apps.slugs) {
    const level = appLevel(slug), label = apps.label(slug), logo = <ConnectorLogo logo={apps.card(slug)?.logo} label={label} />;
    if (level !== "off") cards.push({
      key: `app:${slug}`, label, sub: t(apps.connected(slug) ? "detail.appSub" : "botConnectors.status.needsConnection"), logo,
      control: (
        <div className="bd-seg" role="group" aria-label={t("botConnectors.appAccess", { name: label })}>
          <button type="button" aria-pressed={level === "read"} disabled={!canEditApps} onClick={() => onAppChange(slug, "read")} data-tip={t("detail.access.readTip")}><IconEye size={16} />{t("detail.access.read")}</button>
          <button type="button" aria-pressed={level === "write"} disabled={!canEditApps || !apps.connected(slug)} onClick={() => onAppChange(slug, "write")} data-tip={t("detail.access.writeTip")}><IconPencil size={16} />{t("detail.access.write")}</button>
        </div>
      ),
      remove: canEditApps ? () => onAppChange(slug, "off") : undefined, removeTip: t("detail.removeAccess"),
    });
    else if (canEditApps && apps.connected(slug)) add.push({ key: `app:${slug}`, label, logo, onAdd: () => onAppChange(slug, "read") });
  }

  return (
    <div className="bd-panel">
      {(mcp.failed || apps.failed) && <p role="alert" className="field-err" style={{ marginBottom: 12 }}>{t(mcp.failed ? "botConnectors.failed" : "botConnectors.permissionsFailed")}</p>}
      <div className="bd-cgrid" aria-busy={mcp.loading}>
        {cards.map((c) => (
          <div key={c.key} className={`bd-ccard${c.dim ? " is-dim" : ""}`}>
            <button type="button" className="bd-ib bd-rm danger tip-r" aria-label={`${c.removeTip}: ${c.label}`} data-tip={c.removeTip} disabled={!c.remove} onClick={c.remove}><IconClose size={16} /></button>
            <div className="bd-ccard-head">
              {c.logo}
              <div style={{ minWidth: 0 }}>
                <h4 className="ellipsis">{c.label}</h4>
                <p className="ellipsis">{c.sub}</p>
              </div>
            </div>
            {c.control}
          </div>
        ))}
        <div className="bd-addwrap" ref={pickerRef}>
          <button type="button" className="bd-addcard" aria-expanded={picker} aria-label={t("detail.addAccess")} data-tip={t("detail.addAccess")} onClick={() => setPicker((v) => !v)}>
            <IconPlus size={22} />
          </button>
          {picker && (
            <div className="bd-pop" role="dialog" aria-label={t("detail.addAccess")}>
              {add.map((item) => (
                <button key={item.key} type="button" className="bd-app" aria-label={item.label} data-tip={item.label} onClick={() => { item.onAdd(); setPicker(false); }}>{item.logo}</button>
              ))}
              <a className="bd-app" href={href.connectors} aria-label={t("detail.connectNew")} data-tip={t("detail.connectNew")}><span className="bd-logo bd-logo-new"><IconPlus size={20} /></span></a>
            </div>
          )}
        </div>
      </div>
      {mcp.loading && <p role="status" className="hint" style={{ marginTop: 12 }}>{t("common.loading")}</p>}
      {!botExists || !runtime ? <p className="hint" style={{ marginTop: 12 }}>{t("botConnectors.saveBotFirst")}</p>
        : apps.data && !apps.configured && <p className="hint" style={{ marginTop: 12 }}>{t("connectors.setupRequired")}</p>}
    </div>
  );
}
