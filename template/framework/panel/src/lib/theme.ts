// Light/dark theme: system preference by default, plus a remembered toggle.
// index.html applies the same logic before first paint.
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "fyso.theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function stored(): Theme | null {
  const q = new URLSearchParams(location.search).get("theme");
  if (q === "light" || q === "dark") return q;
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

const system = (): Theme => (media().matches ? "dark" : "light");

export function useTheme(): [Theme, () => void] {
  const [choice, setChoice] = useState<Theme | null>(stored);
  const [sys, setSys] = useState<Theme>(system);
  useEffect(() => {
    const m = media();
    const on = () => setSys(system());
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const theme = choice ?? sys;
  useEffect(() => {
    document.documentElement.className = `fy-${theme}`;
  }, [theme]);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setChoice(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode */
    }
  };
  return [theme, toggle];
}
