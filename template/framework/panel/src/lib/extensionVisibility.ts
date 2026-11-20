// Pages listed only while their extension says so (extensions-contract §9, D95): the panel
// reads the declared field of the extension's own API. A page with a condition stays out of
// the menus until the answer is `true`; any error or other answer keeps it out.
import { useEffect, useSyncExternalStore } from "react";
import type { Extension, ExtensionPageVisibility } from "../api/types";
import { REFRESH_EVENT } from "./extensionBadges";

type Declared = { key: string; visible: ExtensionPageVisibility };
const EVERY_MS = 30000;

let declared: Declared[] = [];
let signature = "";
let state: Record<string, boolean> = {};
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
const listeners = new Set<() => void>();

export const pageKey = (extensionId: string, pageId: string) => `extension:${extensionId}:${pageId}`;

async function read({ url, field }: ExtensionPageVisibility): Promise<boolean> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) return false;
  const data = (await response.json()) as Record<string, unknown>;
  return data !== null && typeof data === "object" && data[field] === true;
}

async function refresh() {
  if (running || declared.length === 0 || document.hidden) return;
  running = true;
  try {
    const entries = await Promise.all(declared.map(async ({ key, visible }) => {
      try { return [key, await read(visible)] as const; } catch { return [key, false] as const; }
    }));
    const next = Object.fromEntries(entries);
    if (JSON.stringify(next) !== JSON.stringify(state)) { state = next; listeners.forEach((notify) => notify()); }
  } finally { running = false; }
}

function watch(extensions: Extension[], enabled: boolean) {
  const next = enabled ? extensions.flatMap((ext) => (ext.pages ?? []).filter((page) => page.visible)
    .map((page) => ({ key: pageKey(ext.id, page.id), visible: page.visible! }))) : [];
  const nextSignature = JSON.stringify(next);
  if (nextSignature === signature) return;
  signature = nextSignature; declared = next;
  void refresh();
}

const onRefresh = () => void refresh();
function subscribe(notify: () => void) {
  listeners.add(notify);
  if (listeners.size === 1) {
    timer = setInterval(onRefresh, EVERY_MS);
    // A page that connects or disconnects calls the SDK's refreshBadges(): it refreshes these too.
    window.addEventListener(REFRESH_EVENT, onRefresh);
    document.addEventListener("visibilitychange", onRefresh);
    window.addEventListener("hashchange", onRefresh);
  }
  return () => {
    listeners.delete(notify);
    if (listeners.size === 0) {
      clearInterval(timer);
      window.removeEventListener(REFRESH_EVENT, onRefresh);
      document.removeEventListener("visibilitychange", onRefresh);
      window.removeEventListener("hashchange", onRefresh);
    }
  };
}

/** Whether a page belongs in the menus: pages without a condition always do; in mock mode, all. */
export function useExtensionVisibility(extensions: Extension[], enabled: boolean) {
  useEffect(() => { watch(extensions, enabled); }, [extensions, enabled]);
  const current = useSyncExternalStore(subscribe, () => state);
  return (extensionId: string, pageId: string, conditional: boolean) =>
    !conditional || !enabled || current[pageKey(extensionId, pageId)] === true;
}
