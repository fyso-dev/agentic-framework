import type { Backend } from "./types";
import { httpBackend } from "./http";

export type LoadedBackend = { backend: Backend; mock: string | null; initialDraft: string | null };

/** Mock mode: VITE_MOCK=1 at build/dev time, or `?mock[=scenario]` in the URL. */
export function mockScenario(): string | null {
  const q = new URLSearchParams(location.search);
  if (q.has("mock")) return q.get("mock") || "ready";
  return import.meta.env.VITE_MOCK === "1" ? "ready" : null;
}

export async function loadBackend(): Promise<LoadedBackend> {
  const scenario = mockScenario();
  if (!scenario) return { backend: httpBackend, mock: null, initialDraft: null };
  // Fixtures live in their own chunk, loaded only in mock mode.
  const { createMockBackend } = await import("./mock");
  const known = ["ready", "failed", "first", "empty", "applyfail"] as const;
  const s = (known as readonly string[]).includes(scenario) ? (scenario as (typeof known)[number]) : "ready";
  const backend = createMockBackend(s);
  return { backend, mock: s, initialDraft: backend.initialDraft };
}
