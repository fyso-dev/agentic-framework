// Plain hash routing: #/ · #/bots · #/bots/new · #/bots/<index> · #/bots/review · #/apps
import { useEffect, useState } from "react";

export type Route =
  | { name: "setup" }
  | { name: "bots"; review?: boolean }
  | { name: "bot"; index: number | null }
  | { name: "apps" };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
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
  apps: "#/apps",
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
