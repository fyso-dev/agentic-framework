// Counters that extension pages declare (extensions-contract §9). The panel runs
// the declared Dagu query itself; no extension code runs in the host.
import { useEffect, useSyncExternalStore } from "react";
import type { Extension, ExtensionPageBadge } from "../api/types";

export type BadgeState = { count: number; warn: boolean };
type Declared = { key: string; badge: ExtensionPageBadge };

const STATUS = { waiting: "7" } as const;
const PAGE = 100, MAX_PAGES = 5, EVERY_MS = 30000;
export const REFRESH_EVENT = "fyso-extension-badges-refresh";

let declared: Declared[] = [];
let signature = "";
let state: Record<string, BadgeState> = {};
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
const listeners = new Set<() => void>();

async function count(badge: ExtensionPageBadge): Promise<BadgeState> {
  const [first, ...rest] = badge.dagu_runs.labels;
  const warn = badge.warn_labels ?? [];
  let cursor = "", total = 0, flagged = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ status: STATUS[badge.dagu_runs.status], labels: first, limit: String(PAGE) });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`/api/dagu/dag-runs?${query}`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { dagRuns?: { labels?: string[] }[]; nextCursor?: string };
    for (const run of data.dagRuns ?? []) {
      const labels = Array.isArray(run.labels) ? run.labels : [];
      if (!rest.every((label) => labels.includes(label))) continue;
      total++;
      if (warn.length > 0 && warn.every((label) => labels.includes(label))) flagged = true;
    }
    cursor = data.nextCursor ?? "";
    if (!cursor) break;
  }
  return { count: total, warn: flagged };
}

async function refresh() {
  if (running || declared.length === 0 || document.hidden) return;
  running = true;
  try {
    const entries = await Promise.all(
      declared.map(async ({ key, badge }) => {
        try { return [key, await count(badge)] as const; }
        // An unreachable Dagu shows no counter rather than a stale or wrong one.
        catch { return [key, undefined] as const; }
      }),
    );
    const next: Record<string, BadgeState> = {};
    for (const [key, value] of entries) if (value) next[key] = value;
    if (JSON.stringify(next) !== JSON.stringify(state)) { state = next; listeners.forEach((notify) => notify()); }
  } finally { running = false; }
}

/** Ask the panel to count again now, e.g. after an extension page changed a run. */
export function refreshBadges() {
  const host = window.parent && window.parent !== window ? window.parent : window;
  try { host.dispatchEvent(new Event(REFRESH_EVENT)); } catch { /* a cross-origin parent has no counters */ }
}

function watch(extensions: Extension[], enabled: boolean) {
  const next = enabled ? extensions.flatMap((ext) => (ext.pages ?? []).filter((page) => page.badge).map((page) => ({ key: `extension:${ext.id}:${page.id}`, badge: page.badge! }))) : [];
  const nextSignature = JSON.stringify(next);
  if (nextSignature === signature) return;
  signature = nextSignature; declared = next;
  if (next.length === 0 && Object.keys(state).length > 0) { state = {}; listeners.forEach((notify) => notify()); }
  void refresh();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  if (listeners.size === 1) {
    timer = setInterval(() => void refresh(), EVERY_MS);
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
const onRefresh = () => void refresh();

/** Current counters by navigation id (`extension:<ext>:<page>`). Empty in mock mode. */
export function useExtensionBadges(extensions: Extension[], enabled: boolean): Record<string, BadgeState> {
  useEffect(() => watch(extensions, enabled), [extensions, enabled]);
  return useSyncExternalStore(subscribe, () => state);
}
