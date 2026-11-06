// Shared state: config files, the local draft of team.yaml, app health and the
// two long-lived actions (setup check and snapshot).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LoadedBackend } from "./api";
import { DAGS, type App, type Backend, type Health, type Project, type SetupCheck } from "./api/types";
import { diffBots, listedBots, parseTeam, readBots, type Bot, type BotRow } from "./lib/team";
import { useDaguAction, type Action } from "./lib/useDaguAction";

type Loadable<T> = { status: "loading" | "ok" | "error"; data?: T; error?: string };

export type StepId = "engines" | "bots" | "dagu" | "git";
export type StepState = "loading" | "never" | "checking" | "done" | "pending" | "failed";

export type Store = {
  backend: Backend;
  mock: string | null;
  project: Loadable<Project>;
  team: Loadable<string>;
  apps: Loadable<App[]>;
  health: Record<string, Health>;
  reload(): void;
  /** Local, unapplied edits of team.yaml (null when there are none). */
  draft: string | null;
  /** True once team.yaml is loaded and a saved draft (if any) is restored. */
  draftReady: boolean;
  setDraft(text: string | null): void;
  /** The team file the form edits: the draft if any, else the file on disk. */
  workingText: string | null;
  baseBots: Bot[];
  workingBots: Bot[];
  rows: BotRow[];
  draftChanges: number;
  check: Action<SetupCheck>;
  snapshot: Action<string>;
  /** Latest known check output (from the running/last run). */
  checkData?: SetupCheck;
  steps: Record<StepId, StepState>;
  stepsDone: number;
  anyFailed: boolean;
  noData: boolean;
  afterApply(): void;
};

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

const draftKey = (slug: string) => `fyso.panel.${slug}.draft`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function safeBots(text: string | null | undefined): Bot[] {
  if (!text) return [];
  try {
    return listedBots(readBots(parseTeam(text)));
  } catch {
    return [];
  }
}

export function StoreProvider({ loaded, children }: { loaded: LoadedBackend; children: ReactNode }) {
  const { backend, mock } = loaded;
  const [project, setProject] = useState<Loadable<Project>>({ status: "loading" });
  const [team, setTeam] = useState<Loadable<string>>({ status: "loading" });
  const [apps, setApps] = useState<Loadable<App[]>>({ status: "loading" });
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [draft, setDraftState] = useState<string | null>(null);
  const draftInit = useRef(false);
  const [draftReady, setDraftReady] = useState(false);

  const check = useDaguAction<SetupCheck>(backend, DAGS.setupCheck, "check", { loadLast: true });
  const snapshot = useDaguAction<string>(backend, DAGS.snapshot, "result", { loadLast: true });

  const loadTeam = useCallback(async () => {
    try {
      const text = await backend.getTeam();
      setTeam({ status: "ok", data: text });
      return text;
    } catch (e) {
      setTeam({ status: "error", error: message(e) });
      return null;
    }
  }, [backend]);

  const load = useCallback(() => {
    backend.getProject().then(
      (data) => setProject({ status: "ok", data }),
      (e) => setProject({ status: "error", error: message(e) }),
    );
    void loadTeam();
    backend.getApps().then(
      (data) => setApps({ status: "ok", data }),
      (e) => setApps({ status: "error", error: message(e) }),
    );
  }, [backend, loadTeam]);

  useEffect(load, [load]);

  // Restore a saved draft once project + team are known; drop it if team.yaml changed since.
  useEffect(() => {
    if (draftInit.current || project.status !== "ok" || team.status !== "ok") return;
    draftInit.current = true;
    setDraftReady(true);
    if (mock) {
      if (loaded.initialDraft && loaded.initialDraft !== team.data) setDraftState(loaded.initialDraft);
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey(project.data!.slug)) ?? "null") as
        | { base: string; draft: string }
        | null;
      if (saved && saved.base === team.data && saved.draft !== team.data) setDraftState(saved.draft);
    } catch {
      /* ignore a broken entry */
    }
  }, [project, team, mock, loaded.initialDraft]);

  const setDraft = useCallback(
    (text: string | null) => {
      const next = text === null || text === team.data ? null : text;
      setDraftState(next);
      if (mock || project.status !== "ok") return;
      try {
        const key = draftKey(project.data!.slug);
        if (next === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify({ base: team.data, draft: next }));
      } catch {
        /* private mode: the draft lives in memory only */
      }
    },
    [mock, project, team.data],
  );

  // App health: no-cors probe of each enabled app, now and every minute.
  useEffect(() => {
    if (apps.status !== "ok") return;
    let stop = false;
    const probeAll = () =>
      apps.data!.filter((a) => a.enabled).forEach((a) => {
        void backend.probe(a.url).then((ok) => {
          if (!stop) setHealth((h) => ({ ...h, [a.id]: ok ? "ok" : "down" }));
        });
      });
    probeAll();
    const id = setInterval(probeAll, 60_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [apps, backend]);

  const workingText = draft ?? team.data ?? null;
  const baseBots = useMemo(() => safeBots(team.data), [team.data]);
  const workingBots = useMemo(() => safeBots(workingText), [workingText]);
  const rows = useMemo(() => diffBots(baseBots, workingBots), [baseBots, workingBots]);
  const draftChanges = draft ? rows.filter((r) => r.state !== "applied").length : 0;

  const checkData = check.output;
  const steps = useMemo((): Record<StepId, StepState> => {
    const fromCheck = (ok: (c: SetupCheck) => StepState): StepState => {
      if (check.phase === "loading") return "loading";
      if (check.phase === "running") return "checking";
      if (check.phase === "failed" && !checkData) return "failed";
      if (!checkData) return "never";
      return ok(checkData);
    };
    const engines = check.phase === "failed" ? "failed" : fromCheck((c) =>
      c.engines.length > 0 && c.engines.every((e) => e.ok) ? "done" : "failed");
    const bots: StepState = draftChanges > 0 && check.phase !== "running" && check.phase !== "loading"
      ? "pending"
      : fromCheck((c) => (c.bots.ok ? "done" : "pending"));
    const dagu = fromCheck((c) => (c.dagu.ok ? "done" : "failed"));
    const git: StepState =
      snapshot.phase === "loading" ? "loading"
      : snapshot.phase === "running" ? "checking"
      : snapshot.phase === "failed" ? "failed"
      : snapshot.phase === "never" ? "never"
      : "done";
    return { engines, bots, dagu, git };
  }, [check.phase, checkData, draftChanges, snapshot.phase]);

  const values = Object.values(steps);
  const stepsDone = values.filter((s) => s === "done").length;
  const anyFailed = values.includes("failed");
  const noData = check.phase === "never" && snapshot.phase === "never";

  const afterApply = useCallback(() => {
    setDraft(null);
    void loadTeam();
    void snapshot.reload();
    void check.start();
  }, [setDraft, loadTeam, snapshot.reload, check.start]);


  const store: Store = {
    backend, mock, project, team, apps, health, reload: load,
    draft, draftReady, setDraft, workingText,
 baseBots, workingBots, rows, draftChanges,
    check, snapshot, checkData, steps, stepsDone, anyFailed, noData, afterApply,
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
