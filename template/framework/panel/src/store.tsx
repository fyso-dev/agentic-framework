// Shared state: config files, the local draft of team.yaml, app health and the
// two long-lived actions (setup check and snapshot).
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LoadedBackend } from "./api";
import { DAGS, type App, type Backend, type Extension, type ThirdPartySkill, type Health, type Project, type RuntimeBot, type BotVersioning, type SetupCheck } from "./api/types";
import { changedTeams, diffBots, listedBots, parseTeam, readBots, readTeams, type Bot, type BotRow, type Team } from "./lib/team";
import { useDaguAction, type Action } from "./lib/useDaguAction";

type Loadable<T> = { status: "loading" | "ok" | "error"; data?: T; error?: string };

export type StepId = "engines" | "bots" | "dagu" | "git";
export type StepState = "loading" | "never" | "checking" | "done" | "pending" | "failed";

export type Store = {
  backend: Backend;
  mock: string | null;
  project: Loadable<Project>;
  team: Loadable<string>;
  runtimeBots: Loadable<RuntimeBot[]>;
  botVersioning: Loadable<BotVersioning>;
  apps: Loadable<App[]>;
  extensions: Loadable<Extension[]>;
  /** Installed third-party skills (D64). */
  skills: Loadable<ThirdPartySkill[]>;
  health: Record<string, Health>;
  reload(): void;
  /** Local, unapplied edits of team.yaml (null when there are none). */
  draft: string | null;
  draftBase: string | null;
  draftConflict: boolean;
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
  /** One step per installed extension with a setup.yaml (D51). */
  extSteps: { ext: Extension; state: StepState }[];
  stepsDone: number;
  stepsTotal: number;
  anyFailed: boolean;
  noData: boolean;
  afterApply(clearDraft?: boolean): Promise<void>;
};

const Ctx = createContext<Store | null>(null);

/** Whether an app opens inside the panel (D92, `embed: true`). */
export const embedded = (s: { apps: Loadable<App[]> }, id: string) =>
  !!s.apps.data?.some((app) => app.id === id && app.enabled && app.embed);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

const draftKey = (slug: string) => `fyso.panel.${slug}.draft`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function safeTeams(text: string | null | undefined): Team[] {
  if (!text) return [];
  try {
    return readTeams(parseTeam(text));
  } catch {
    return [];
  }
}

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
  const [botVersioning, setBotVersioning] = useState<Loadable<BotVersioning>>({status:"loading"});
  const [runtimeBots, setRuntimeBots] = useState<Loadable<RuntimeBot[]>>({ status: "loading" });
  const [apps, setApps] = useState<Loadable<App[]>>({ status: "loading" });
  const [extensions, setExtensions] = useState<Loadable<Extension[]>>({ status: "loading" });
  const [skills, setSkills] = useState<Loadable<ThirdPartySkill[]>>({ status: "loading" });
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [savedDraft, setDraftState] = useState<{ base: string; draft: string } | null>(null);
  const draft = savedDraft?.draft ?? null;
  const draftBase = savedDraft?.base ?? null;
  const draftConflict = draftBase !== null && team.data !== draftBase;
  const rosterRefresh = useRef<Promise<void> | null>(null);
  const draftInit = useRef(false);
  const [draftReady, setDraftReady] = useState(false);

  const check = useDaguAction<SetupCheck>(backend, DAGS.setupCheck, "check", { loadLast: true });
  // A check run elsewhere (CLI, an agent, another tab) shows up when this tab is back in view.
  const reloadCheck = check.reload;
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void reloadCheck(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, [reloadCheck]);
  const snapshot = useDaguAction<string>(backend, DAGS.snapshot, "result", { loadLast: true });

  // Read the declaration, native roster and version inventory in one refresh.
  const refreshRoster = useCallback(() => {
    if (rosterRefresh.current) return rosterRefresh.current;
    rosterRefresh.current = Promise.allSettled([
      backend.getTeam(), backend.getRuntimeBots(), backend.getBotVersioning(),
    ]).then(([nextTeam, nextRuntime, nextVersion]) => {
      setTeam(previous => nextTeam.status === "fulfilled"
        ? { status: "ok", data: nextTeam.value }
        : { ...previous, status: "error", error: message(nextTeam.reason) });
      setRuntimeBots(previous => nextRuntime.status === "fulfilled"
        ? { status: "ok", data: nextRuntime.value }
        : { ...previous, status: "error", error: message(nextRuntime.reason) });
      setBotVersioning(previous => nextVersion.status === "fulfilled"
        ? { status: "ok", data: nextVersion.value }
        : { ...previous, status: "error", error: message(nextVersion.reason) });
    }).finally(() => { rosterRefresh.current = null; });
    return rosterRefresh.current;
  }, [backend]);

  // Config files change outside this page: a panel install, `mise run ext:add|ext:remove`,
  // an agent's fyso_ext_install, another tab. Unchanged content keeps its state object, so
  // a background read does not re-render or re-probe the apps; a failed one keeps what is shown.
  const readConfig = useCallback((background: boolean) => {
    const keep = <T,>(set: (f: (p: Loadable<T>) => Loadable<T>) => void, read: Promise<T>) => read.then(
      (data) => set((p) => (p.status === "ok" && JSON.stringify(p.data) === JSON.stringify(data) ? p : { status: "ok", data })),
      (e) => { if (!background) set((p) => ({ ...p, status: "error", error: message(e) })); },
    );
    void keep(setProject, backend.getProject());
    void keep(setApps, backend.getApps());
    void keep(setExtensions, backend.getExtensions());
    void keep(setSkills, backend.getSkills());
  }, [backend]);

  const load = useCallback(() => {
    void refreshRoster();
    readConfig(false);
  }, [refreshRoster, readConfig]);

  useEffect(load, [load]);

  useEffect(() => {
    if (mock) return;
    const onFocus = () => {
      void refreshRoster();
      readConfig(true);
    };
    const timer = setInterval(onFocus, 5000);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [mock, refreshRoster, readConfig]);

  // Keep the original base so an external change cannot be mistaken for an edit.
  useEffect(() => {
    if (draftInit.current || project.status !== "ok" || team.status !== "ok" || team.data === undefined) return;
    draftInit.current = true;
    setDraftReady(true);
    if (mock) {
      if (loaded.initialDraft && loaded.initialDraft !== team.data) setDraftState({ base: team.data, draft: loaded.initialDraft });
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey(project.data!.slug)) ?? "null") as
        | { base: string; draft: string }
        | null;
      if (saved && typeof saved.base === "string" && typeof saved.draft === "string" && saved.draft !== team.data) setDraftState(saved);
    } catch {
      /* ignore a broken entry */
    }
  }, [project, team, mock, loaded.initialDraft]);

  const setDraft = useCallback(
    (text: string | null) => {
      const base = draftBase ?? team.data;
      const next = text === null || text === base || base === undefined ? null : { base, draft: text };
      setDraftState(next);
      if (mock || project.status !== "ok") return;
      try {
        const key = draftKey(project.data!.slug);
        if (next === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* private mode: the draft lives in memory only */
      }
    },
    [mock, project, draftBase, team.data],
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
  const baseBots = useMemo(() => safeBots(draftBase ?? team.data), [draftBase, team.data]);
  const workingBots = useMemo(() => safeBots(workingText), [workingText]);
  const rows = useMemo(() => diffBots(baseBots, workingBots), [baseBots, workingBots]);
  // Departments (D81) count too: a draft may only declare one or change its instructions.
  const teamChanges = useMemo(() => draft ? changedTeams(safeTeams(draftBase ?? team.data), safeTeams(draft)).length : 0, [draft, draftBase, team.data]);
  const draftChanges = draft ? rows.filter((r) => r.state !== "applied").length + teamChanges : 0;

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

  const extSteps = useMemo(() => (extensions.data ?? []).filter((ext) => ext.setup).map((ext) => {
    const state: StepState = check.phase === "loading" ? "loading"
      : check.phase === "running" ? "checking"
      : !checkData ? "never"
      : checkData.extensions?.find((e) => e.id === ext.id)?.state ?? "never";
    return { ext, state };
  }), [extensions.data, check.phase, checkData]);
  const values = [...Object.values(steps), ...extSteps.map((e) => e.state)];
  const stepsDone = values.filter((s) => s === "done").length;
  const stepsTotal = values.length;
  const anyFailed = values.includes("failed");
  const noData = check.phase === "never" && snapshot.phase === "never";

  const afterApply = useCallback(async (clearDraft = true) => {
    if (clearDraft) setDraft(null);
    await rosterRefresh.current;
    const freshRoster = refreshRoster();
    void snapshot.reload();
    void check.start();
    await freshRoster;
  }, [setDraft, refreshRoster, snapshot.reload, check.start]);


  const store: Store = {
    backend, mock, project, team, runtimeBots, botVersioning, apps, extensions, skills, health, reload: load,
    draft, draftBase, draftConflict, draftReady, setDraft, workingText,
 baseBots, workingBots, rows, draftChanges,
    check, snapshot, checkData, steps, extSteps, stepsDone, stepsTotal, anyFailed, noData, afterApply,
  };
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
