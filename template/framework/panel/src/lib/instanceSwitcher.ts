/**
 * Instance switcher (D92, extensions-contract §9): an installed extension names one URL in
 * `extensions/<ext>/switcher.yaml`; it answers `{items: [{name, url}]}`. Only plain
 * http(s) links with a name are kept, so a bad answer can never become a script link.
 */
export type SwitcherItem = { name: string; url: string; current: boolean };

export const MAX_SWITCHER_ITEMS = 50;

export function switcherItems(data: unknown, here: string): SwitcherItem[] {
  const list = data && typeof data === "object" && !Array.isArray(data) ? (data as { items?: unknown }).items : undefined;
  if (!Array.isArray(list)) return [];
  const origin = new URL(here).origin;
  const items: SwitcherItem[] = [];
  for (const entry of list.slice(0, MAX_SWITCHER_ITEMS)) {
    if (!entry || typeof entry !== "object") continue;
    const { name, url } = entry as { name?: unknown; url?: unknown };
    if (typeof name !== "string" || !name.trim() || typeof url !== "string") continue;
    let target: URL;
    try { target = new URL(url, here); } catch { continue; }
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) continue;
    items.push({ name: name.trim().slice(0, 80), url: target.href, current: target.origin === origin });
  }
  return items;
}

/** The session cookie travels only to the same site; a path on this origin needs nothing more. */
export function switcherRequest(source: string, here: string): { url: string; credentials: RequestCredentials } {
  const url = new URL(source, here);
  return { url: url.href, credentials: url.origin === new URL(here).origin ? "same-origin" : "include" };
}
