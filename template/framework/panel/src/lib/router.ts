// Plain hash routing: #/ · #/bots · #/bots/new · #/bots/<index> · #/bots/review · #/apps
import { useEffect, useState } from "react";

export type Route =
  | { name: "setup" }
  | { name: "bots"; review?: boolean }
  | { name: "bot"; index: number | null }
  | { name: "extension"; extensionId:string; pageId:string }
  | { name: "apps" }
  | { name: "observability" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "observability") return { name: "observability" };
  if (parts[0] === "extensions" && parts[1] && parts[2]) return {name:"extension",extensionId:parts[1],pageId:parts[2]};
  if (parts[0] === "apps") return { name: "apps" };
  if (parts[0] === "bots") {
    if (parts[1] === "review") return { name: "bots", review: true };
    if (parts[1] === "new") return { name: "bot", index: null };
    if (parts[1] && /^\d+$/.test(parts[1])) return { name: "bot", index: Number(parts[1]) };
    return { name: "bots" };
  }
  return { name: "setup" };
}

export const href = {
  setup: "#/",
  bots: "#/bots",
  review: "#/bots/review",
  newBot: "#/bots/new",
  bot: (index: number) => `#/bots/${index}`,
  extension: (id:string,page:string) => `#/extensions/${encodeURIComponent(id)}/${encodeURIComponent(page)}`,
  apps: "#/apps",
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
