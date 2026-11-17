export type Usage = {
  turns: number; input: number | null; output: number | null; cachedInput: number | null; reasoning?: number | null;
  apiReportedUsd: number | null; subscriptionEquivalentUsd: number | null;
  estimatedApiUsd: number | null; unclassifiedUsd: number | null;
  missingCost: number; missingTokens: number;
};
export type UsageGroup = Usage & {bot: string; model: string; engine?: string; source: string; billingKind: string};
/** One UTC day of one agent/model/engine (D84). */
export type DailyUsage = Usage & {day: string; bot: string; model: string; engine: string};
/** One subscription window of one engine account as the provider reports it (D84). Null = unknown. */
export type SubscriptionWindow = {
  instanceId: string; engine: string | null; plan: string | null; window: "fiveHour" | "weekly";
  usedPercent: number | null; resetsAt: string | null; checkedAt: string | null;
};
export type Trace = {
  id: string; startedAt: number; durationMs: number; running: boolean;
  bots: {id: string; name: string}[]; steps: number; tools: number; errors: number;
  usageStatus: string; usage: Usage;
};
export type ObservedRun = {
  id: string; dag: string; statusLabel: string; startedAt: string; finishedAt: string;
  retries: number; sourceThread: string | null; sourceTurn: string | null; traceId: string | null; usage: Usage;
};
export type Observation = {
  version: number; collectedAt: string; from: string; to: string;
  sources: Record<string, string>; warnings: string[]; invalidRows: number;
  coverage: {tracesTruncated: boolean; runsTruncated: boolean};
  usage: {totals: Usage; groups: UsageGroup[]}; daily?: DailyUsage[]; subscription?: SubscriptionWindow[]; traces: Trace[]; runs: ObservedRun[];
  alerts: {kind: string; value: number; limit: number; runId?: string; dag?: string; traceId?: string}[];
};
