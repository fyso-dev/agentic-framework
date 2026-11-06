// One action = one Dagu workflow (contract §2). Always enqueue, then poll the run.
import { useCallback, useEffect, useRef, useState } from "react";
import { HttpError } from "../api/http";
import { visualOf, type Backend, type Run } from "../api/types";

/**
 * - loading: reading the last run
 * - never:   it has never run
 * - idle:    last run succeeded before this page was opened
 * - running: queued, running or waiting in Dagu
 * - ok:      succeeded during this session
 * - failed:  the last run failed (or could not be started)
 */
export type ActionPhase = "loading" | "never" | "idle" | "running" | "ok" | "failed";

export type ActionState<T> = {
  phase: ActionPhase;
  run?: Run;
  output?: T;
  /** Server error, shown verbatim. */
  error?: string;
  /** When the current run started (ms), for "running · 12 s". */
  since?: number;
};

export type Action<T> = ActionState<T> & {
  dag: string;
  start(params?: Record<string, string>): Promise<T | undefined>;
  reload(): Promise<void>;
  reset(): void;
};

const POLL_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const message = (e: unknown) => (e instanceof HttpError ? e.message : e instanceof Error ? e.message : String(e));

/** Outputs are JSON strings (contract §3); plain strings are kept as they are. */
export function parseOutput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function useDaguAction<T>(
  backend: Backend,
  dag: string,
  outputKey: string,
  opts: { loadLast?: boolean } = {},
): Action<T> {
  const [state, setState] = useState<ActionState<T>>({ phase: opts.loadLast ? "loading" : "never" });
  const alive = useRef(true);
  const token = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // While a run is in progress, the previous output stays visible.
  const set = useCallback((s: ActionState<T>, my: number) => {
    if (!alive.current || my !== token.current) return;
    setState((prev) => (s.phase === "running" && s.output === undefined ? { ...s, output: prev.output } : s));
  }, []);


  const readOutput = useCallback(
    async (runId: string): Promise<T | undefined> => {
      const outputs = await backend.getOutputs(dag, runId);
      const raw = outputs[outputKey] ?? outputs[outputKey.toLowerCase()];
      return raw === undefined ? undefined : (parseOutput(raw) as T);
    },
    [backend, dag, outputKey],
  );

  /** Poll until the run leaves the running states. */
  const follow = useCallback(
    async (runId: string, my: number, since: number): Promise<T | undefined> => {
      for (;;) {
        if (!alive.current || my !== token.current) return undefined;
        let run: Run;
        try {
          run = await backend.getRun(dag, runId);
        } catch {
          // A transient error while polling (or a run not visible yet): keep trying.
          await sleep(POLL_MS * 2);
          continue;
        }
        const started = run.startedAt ? Date.parse(run.startedAt) : since;
        const v = visualOf(run.statusLabel);
        if (v === "running") {
          set({ phase: "running", run, since: Number.isNaN(started) ? since : started }, my);
          await sleep(POLL_MS);
          continue;
        }
        if (v === "ok") {
          let output: T | undefined;
          try {
            output = await readOutput(runId);
          } catch (e) {
            set({ phase: "failed", run, error: message(e) }, my);
            return undefined;
          }
          set({ phase: "ok", run, output }, my);
          return output;
        }
        set({ phase: "failed", run, error: run.error }, my);
        return undefined;
      }
    },
    [backend, dag, readOutput, set],
  );

  const reload = useCallback(async () => {
    const my = ++token.current;
    try {
      const run = await backend.lastRun(dag);
      if (!run) return set({ phase: "never" }, my);
      const v = visualOf(run.statusLabel);
      if (v === "running") {
        const since = run.startedAt ? Date.parse(run.startedAt) : Date.now();
        set({ phase: "running", run, since }, my);
        await follow(run.id, my, since);
        return;
      }
      if (v === "ok") {
        const output = await readOutput(run.id).catch(() => undefined);
        return set({ phase: "idle", run, output }, my);
      }
      if (v === "failed") return set({ phase: "failed", run, error: run.error }, my);
      set({ phase: "never" }, my);
    } catch (e) {
      set({ phase: "never", error: message(e) }, my);
    }
  }, [backend, dag, follow, readOutput, set]);

  const loadLast = opts.loadLast;
  useEffect(() => {
    if (loadLast) void reload();
  }, [loadLast, reload]);


  const start = useCallback(
    async (params?: Record<string, string>) => {
      const my = ++token.current;
      const since = Date.now();
      setState((s) => ({ phase: "running", since, output: s.output }));
      let runId: string;
      try {
        runId = await backend.enqueue(dag, params);
      } catch (e) {
        set({ phase: "failed", error: message(e) }, my);
        return undefined;
      }
      return follow(runId, my, since);
    },
    [backend, dag, follow, set],
  );

  const reset = useCallback(() => {
    token.current++;
    setState({ phase: "never" });
  }, []);

  return { ...state, dag, start, reload, reset };
}
