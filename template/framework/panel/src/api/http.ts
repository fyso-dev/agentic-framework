// Real backend: read-only files under /config/ and the Dagu API under /api/dagu/,
// both served by Caddy on the panel origin (contract §1, §2).
import type { App, Extension, Backend, Project, Run, ThirdPartySkill } from "./types";

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    body: string,
  ) {
    super(body ? `${status} ${url}: ${body.slice(0, 300)}` : `${status} ${url}`);
  }
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  if (res.status === 401) window.dispatchEvent(new Event("fyso-session-expired"));
  if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ""));
  return res;
}

const json = async <T>(url: string, init?: RequestInit) => (await request(url, init)).json() as Promise<T>;
const dagu = (path: string) => `/api/dagu/${path}`;
const enc = encodeURIComponent;

type DaguNode = { error?: string; status?: number; statusLabel?: string; step?: { name?: string } };
type DaguRunDetails = {
  dagRunId?: string;
  statusLabel?: string;
  startedAt?: string;
  finishedAt?: string;
  nodes?: DaguNode[];
  onFailure?: DaguNode;
  error?: string;
};

// Dagu uses "-" or "" for times that are not set.
const time = (v?: string) => (v && v !== "-" ? v : undefined);

export function toRun(d: DaguRunDetails, fallbackId = ""): Run {
  const failed = d.nodes?.find((n) => n.error);
  return {
    id: d.dagRunId ?? fallbackId,
    statusLabel: d.statusLabel ?? "not_started",
    startedAt: time(d.startedAt),
    finishedAt: time(d.finishedAt),
    error: failed?.error || d.error || undefined,
  };
}


// D80: Dagu 2.24.0 scans its queue at most every 3 s, so every enqueued action waits 0–3 s
// before it starts. `start` begins at once but ignores `max_active_runs` (even with
// `singleton`, concurrent starts all run), so it is used only for workflows that declare
// they may overlap (`max_active_runs` other than 1). The answer is cached per page load.
const overlap = new Map<string, Promise<boolean>>();
function mayOverlap(dag: string): Promise<boolean> {
  let known = overlap.get(dag);
  if (!known) {
    known = json<{ dag?: { maxActiveRuns?: number } }>(dagu(`dags/${enc(dag)}`))
      .then((r) => (r.dag?.maxActiveRuns ?? 1) !== 1)
      .catch(() => { overlap.delete(dag); return false; });
    overlap.set(dag, known);
  }
  return known;
}

export const httpBackend: Backend = {
  getBotVersioning: () => json("/config/bot-versioning.json"),
  getRuntimeBots: async () => (await json<{ bots: import("./types").RuntimeBot[] }>("/api/omb/bots")).bots,
  getObservability: () => json("/config/observability.json"),
  getProject: () => json<Project>("/config/project.json"),
  getTeam: async () => (await request("/config/team.yaml")).text(),
  getApps: () => json<App[]>("/config/apps.json"),
  getExtensions: () => json<Extension[]>("/config/extensions.json"),
  // Written on start and after every skill change; a project updated in place has none until then.
  getSkills: () => json<ThirdPartySkill[]>("/config/skills.json").catch((e) => {
    if (e instanceof HttpError && e.status === 404) return [];
    throw e;
  }),

  async enqueue(dag, params) {
    const body = params ? { params: JSON.stringify(params) } : {};
    // D80: a workflow that may overlap starts at once; one that must not waits in Dagu's queue.
    const how = (await mayOverlap(dag)) ? "start" : "enqueue";
    const res = await json<{ dagRunId: string }>(dagu(`dags/${enc(dag)}/${how}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.dagRunId;
  },

  async getRun(dag, runId) {
    const res = await json<{ dagRunDetails: DaguRunDetails }>(dagu(`dag-runs/${enc(dag)}/${enc(runId)}`));
    return toRun(res.dagRunDetails, runId);
  },

  async getOutputs(dag, runId) {
    const res = await json<{ outputs?: Record<string, unknown> }>(dagu(`dag-runs/${enc(dag)}/${enc(runId)}/outputs`));
    return res.outputs ?? {};
  },

  async lastRun(dag) {
    try {
      const res = await json<{ dagRuns?: DaguRunDetails[]; items?: DaguRunDetails[] }>(
        dagu(`dags/${enc(dag)}/dag-runs?limit=1`),
      );
      const first = (res.dagRuns ?? res.items ?? [])[0];
      return first ? toRun(first) : null;
    } catch (e) {
      // A DAG that does not exist yet has no runs.
      if (e instanceof HttpError && e.status === 404) return null;
      throw e;
    }
  },

  async probe(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      await fetch(url, { mode: "no-cors", cache: "no-store", signal: ctrl.signal });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  },
};
