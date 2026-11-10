// Per-bot activity, aggregated from the observability snapshot the panel already
// reads (/config/observability.json). No new collector: same window, same sources.
import { useEffect, useState } from "react";
import type { Observation, Usage } from "../api/observability";
import { useStore } from "../store";

export type BotActivity = {
  from: string;
  to: string;
  conversations: number;
  tools: number;
  /** Conversations with at least one failed step. */
  failed: number;
  /** Best known cost in USD, or null when no source reports one. */
  usd: number | null;
};

const cost = (u: Usage) => u.apiReportedUsd ?? u.estimatedApiUsd ?? u.subscriptionEquivalentUsd ?? null;

export function botActivity(data: Observation, bot: { name: string; id?: string }): BotActivity {
  const traces = data.traces.filter((trace) => trace.bots.some((b) => (bot.id && b.id === bot.id) || b.name === bot.name));
  let usd: number | null = null;
  for (const group of data.usage.groups) {
    if (group.bot !== bot.name && group.bot !== bot.id) continue;
    const value = cost(group);
    if (value !== null) usd = (usd ?? 0) + value;
  }
  return {
    from: data.from,
    to: data.to,
    conversations: traces.length,
    tools: traces.reduce((sum, trace) => sum + trace.tools, 0),
    failed: traces.filter((trace) => trace.errors > 0).length,
    usd,
  };
}

/** The last observability snapshot, read once per mount. Undefined while loading or when unavailable. */
export function useObservation(): Observation | undefined {
  const { backend, mock } = useStore();
  const [data, setData] = useState<Observation>();
  useEffect(() => {
    if (mock) return;
    let active = true;
    backend.getObservability().then((result) => { if (active) setData(result as Observation); }, () => {});
    return () => { active = false; };
  }, [backend, mock]);
  return data;
}
