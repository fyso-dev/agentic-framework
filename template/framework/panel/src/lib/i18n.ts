// i18n (PLAN D12): every UI string is a key in src/locales/<lang>.json. Spanish is
// the default. Adding a language is adding one JSON file: it is picked up here.
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

const files = import.meta.glob<{ default: Record<string, unknown> }>("../locales/*.json", { eager: true });
const resources = Object.fromEntries(
  Object.entries(files).map(([path, mod]) => [path.replace(/^.*\/(.+)\.json$/, "$1"), { translation: mod.default }]),
);

export const DEFAULT_LANG = "es";
export const LANGS = [DEFAULT_LANG, ...Object.keys(resources).filter((l) => l !== DEFAULT_LANG).sort()];
const KEY = "fyso.lang";

function detect(): string {
  const pick = (v: string | null | undefined) => {
    const base = v?.toLowerCase().split("-")[0];
    return base && LANGS.includes(base) ? base : null;
  };
  const fromUrl = pick(new URLSearchParams(location.search).get("lang"));
  if (fromUrl) return fromUrl;
  try {
    const saved = pick(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {
    /* private mode */
  }
  for (const l of navigator.languages ?? [navigator.language]) {
    const p = pick(l);
    if (p) return p;
  }
  return DEFAULT_LANG;
}

const lng = detect();
document.documentElement.lang = lng;

void i18next.use(initReactI18next).init({
  resources,
  lng,
  fallbackLng: DEFAULT_LANG,
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: string) {
  void i18next.changeLanguage(lang);
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* private mode */
  }
}

/** Pick a per-locale value from a contract `*_i18n` map, with a fallback. */
export function localized(lang: string, fallback: string, map?: Record<string, string>): string {
  return map?.[lang] ?? fallback;
}

export default i18next;
