// Real backend: read-only files under /config/ and the Dagu API under /api/dagu/,
// both served by Caddy on the panel origin (contract §1, §2).
import type { App, Extension, Backend, Project, Run } from "./types";

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
  if (!res.ok) throw new HttpError(res.status, url, await res.text().catch(() => ""));
  return res;
}

const json = async <T>(url: string, init?: RequestInit) => (await request(url, init)).json() as Promise<T>;
const dagu = (path: string) => `api/dagu/${path}`;
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

export const httpBackend: Backend = {
  getBotVersioning: () => json("config/bot-versioning.json"),
  getRuntimeBots: async () => (await json<{ bots: import("./types").RuntimeBot[] }>("api/omb/bots")).bots,
  getObservability: () => json("config/observability.json"),
  getProject: () => json<Project>("config/project.json"),
  getTeam: async () => (await request("config/team.yaml")).text(),
  getApps: () => json<App[]>("config/apps.json"),
  getExtensions: () => json<Extension[]>("config/extensions.json"),

  async enqueue(dag, params) {
    const body = params ? { params: JSON.stringify(params) } : {};
    const res = await json<{ dagRunId: string }>(dagu(`dags/${enc(dag)}/enqueue`), {
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
