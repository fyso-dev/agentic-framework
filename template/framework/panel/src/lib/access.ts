import { createContext, useContext, useEffect, useState } from "react";
import type { Route } from "./router";

type Access = { loading: boolean; capabilities: ReadonlySet<string> | null; remoteCredentialPath?: string };
const legacy: Access = { loading: false, capabilities: null };
const pending: Access = { loading: true, capabilities: new Set() };
const denied: Access = { loading: false, capabilities: new Set() };

export const PanelAccessContext = createContext<Access>(legacy);

export function useCapability(capability: string): boolean {
  const { capabilities } = useContext(PanelAccessContext);
  return capabilities === null || capabilities.has(capability);
}

export function usePanelAccess(mock: boolean): Access {
  const [access, setAccess] = useState<Access>(mock ? legacy : pending);
  useEffect(() => {
    if (mock) return;
    const controller = new AbortController();
    let generation = 0;

    async function load() {
      const current = ++generation;
      let next = denied;
      try {
        const response = await fetch("/api/panel-access", { cache: "no-store", signal: controller.signal });
        if (response.status === 204) {
          next = legacy;
        } else if (response.ok) {
          const data: { capabilities?: unknown; remoteCredentialPath?: unknown } = await response.json();
          if (Array.isArray(data.capabilities) && data.capabilities.every((value) => typeof value === "string")) {
            const path = data.remoteCredentialPath;
            const remoteCredentialPath = typeof path === "string" &&
              /^\/api\/ext\/[a-z][a-z0-9-]{1,30}\/[a-z0-9/-]+$/.test(path) && !path.includes("//")
              ? path : undefined;
            next = { loading: false, capabilities: new Set(data.capabilities), remoteCredentialPath };
          }
        }
      } finally {
        if (!controller.signal.aborted && current === generation) setAccess(next);
      }
    }

    const refresh = () => { void load().catch(() => {}); };
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [mock]);
  return mock ? legacy : access;
}

export function pageCapability(id: string): string {
  if (id.startsWith("extension:")) return `page:${id.split(":").slice(0, 2).join(":")}`;
  if (id.startsWith("app:")) return id;
  if (id === "mcp") return "app:mcp";
  return `page:panel:${id}`;
}

export function routePage(route: Route): string {
  switch (route.name) {
    case "extension": return `extension:${route.extensionId}:${route.pageId}`;
    case "app": return `app:${route.id}`;
    case "bot": return "bots";
    default: return route.name;
  }
}
