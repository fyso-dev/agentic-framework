// Plain hash routing: #/ · #/bots · #/bots/new · #/bots/<index>[?tab=…] · #/bots/review · #/apps[?tab=ext]
import { useEffect, useState } from "react";

export type BotTab = "perfil" | "instrucciones" | "conectores";
const TABS: BotTab[] = ["perfil", "instrucciones", "conectores"];

function botTab(query: URLSearchParams): BotTab | undefined {
  const tab = query.get("tab");
  if (TABS.includes(tab as BotTab)) return tab as BotTab;
  return query.get("section") === "connectors" ? "conectores" : undefined;
}

export type AppsTab = "open" | "ext";

export type Route =
  | { name: "setup" }
  | { name: "bots"; review?: boolean; native?: string }
  | { name: "bot"; index: number | null; tab?: BotTab }
  | { name: "connectors"; botId?:string }
  | { name: "extension"; extensionId:string; pageId:string }
  | { name: "mcp" }
  | { name: "apps"; tab?: AppsTab }
  | { name: "observability" };

export function parseHash(hash: string): Route {
  const [pathname,query]=hash.replace(/^#\/?/, "").split("?");
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] === "mcp") return { name: "mcp" };
  if (parts[0] === "observability") return { name: "observability" };
  if (parts[0] === "connectors") {const botId=new URLSearchParams(query||" ").get("bot");return { name: "connectors",...(botId?{botId}:{}) };}
  if (parts[0] === "extensions" && parts[1] && parts[2]) return {name:"extension",extensionId:parts[1],pageId:parts[2]};
  if (parts[0] === "apps") return new URLSearchParams(query || "").get("tab") === "ext" ? { name: "apps", tab: "ext" } : { name: "apps" };
  if (parts[0] === "bots") {
    if (parts[1] === "review") return { name: "bots", review: true };
    const params = new URLSearchParams(query || "");
    const tab = botTab(params);
    if (parts[1] === "new") return { name: "bot", index: null, ...(tab ? { tab } : {}) };
    if (parts[1] && /^\d+$/.test(parts[1])) return { name: "bot", index: Number(parts[1]), ...(tab ? { tab } : {}) };
    const native = params.get("native");
    return { name: "bots", ...(native ? { native } : {}) };
  }
  return { name: "setup" };
}

export const href = {
  setup: "#/",
  bots: "#/bots",
  review: "#/bots/review",
  newBot: "#/bots/new",
  bot: (index: number) => `#/bots/${index}`,
  botConnectors: (index:number) => `#/bots/${index}?tab=conectores`,
  botTab: (index: number | null, tab: BotTab) => `#/bots/${index ?? "new"}?tab=${tab}`,
  nativeBot: (id: string) => `#/bots?native=${encodeURIComponent(id)}`,
  connectors: "#/connectors",
  connectorsForBot: (id:string) => `#/connectors?bot=${encodeURIComponent(id)}`,
  extension: (id:string,page:string) => `#/extensions/${encodeURIComponent(id)}/${encodeURIComponent(page)}`,
  mcp: "#/mcp",
  apps: "#/apps",
  appsTab: (tab: AppsTab) => (tab === "ext" ? "#/apps?tab=ext" : "#/apps"),
  observability: "#/observability",
};

export const go = (h: string) => {
  location.hash = h;
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
