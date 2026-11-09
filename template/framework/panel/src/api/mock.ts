// In-memory backend for development and screenshots (VITE_MOCK=1 or ?mock[=scenario]).
// Fixtures follow docs/panel-contract.md exactly; runs move through Dagu's status labels
// with simulated delays.
//
// Scenarios: ready (default) · failed · first · empty · applyfail
import { DAGS, type App, type Backend, type Extension, type Engine, type Marketplace, type MarketplaceEntry, type Plan, type Project, type Run, type SetupCheck } from "./types";
import { fromBase64Utf8, listedBots, parseTeam, readBots } from "../lib/team";

export type Scenario = "ready" | "failed" | "first" | "empty" | "applyfail";

const PROJECT: Project = {
  name: "Foo project",
  slug: "foo-project",
  env: "local",
  urls: { dagu: "http://dagu.localhost:8400", omb: "http://omb.localhost:8400" },
};

const TEAM = `# This project's bots, in OpenMausBot's native team file format (PLAN §5).
# Fine-tune instructions and memory in OpenMausBot; structure lives here (PLAN D13).
version: 1

defaults:
  computer: "off"
  cwd: \${FYSO_ROOT}            # loads .mcp.json (Dagu MCP) from the project root

bots:
  # OpenMausBot's default bot; listed so export → apply round-trips cleanly.
  - name: MausBot
    chief: true
    model: claude/claude-sonnet-5
    approval: full

  - name: Workflow Architect
    title: Designs and fixes Dagu workflows
    model: claude/claude-sonnet-5
    approval: full             # writes workflows through the Dagu MCP without asking
    soul: { file: \${FYSO_ROOT}/framework/bots/souls/workflow-architect.md }

  - name: Run Operator
    title: Watches runs, explains failures, retries
    model: claude/claude-haiku-4-5
    approval: ask
    soul: { file: \${FYSO_ROOT}/framework/bots/souls/run-operator.md }

  - name: Dispatcher
    title: Assigns deliveries to drivers by zone
    model: claudeApi/claude-sonnet-5
    approval: ask
    soul: |
      ## Role
      You assign the day's deliveries to drivers, by zone.

      ## Rules
      - Read the delivery list through the Dagu workflows; never edit them.
      - When a zone has no driver, say so and stop.
    skills:
      - dagu-workflows
`;

const EMPTY_TEAM = `# This project's bots, in OpenMausBot's native team file format (PLAN §5).
version: 1

defaults:
  computer: "off"
  cwd: \${FYSO_ROOT}

bots:
  - name: MausBot
    chief: true
    model: claude/claude-sonnet-5
    approval: full
`;

/** A local draft with two unapplied changes (one changed bot, one new bot). */
const DRAFT = TEAM.replace(
  "model: claude/claude-haiku-4-5\n    approval: ask",
  "model: claude/claude-sonnet-5\n    approval: ask",
) + `
  - name: Driver Desk
    title: Answers drivers on the road
    model: claude/claude-haiku-4-5
    soul: |
      ## Role
      You answer drivers on the road. Short answers.
`;

const CLAUDE_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5", "claude-sonnet-5", "claude-haiku-4-5"];

function engines(scenario: Scenario): Engine[] {
  return [
    { id: "claude", label: "Claude", kind: "subscription", ok: true, models: CLAUDE_MODELS },
    { id: "claudeApi", label: "Claude", kind: "api", ok: true, models: CLAUDE_MODELS },
    {
      id: "codex", label: "Codex", kind: "subscription", ok: scenario !== "failed",
      models: ["gpt-5.5-codex", "gpt-5.5"], fixHint: "codex login --device-auth",
    },
  ];
}

function extensions(scenario: Scenario): Extension[] {
  if (scenario === "empty") return [];
  return [
    {
      id: "sample", src: "gh:fyso/ext-sample", version: "v1.2.0", apps: ["sample"],
      secrets: [
        {
          name: "SAMPLE_TOKEN", description: "Token de ejemplo", description_i18n: { en: "Sample token" },
          required: true, set: scenario !== "failed",
        },
        { name: "SAMPLE_WEBHOOK", required: false, set: false },
      ],
      mcpServers: ["sample"], workflows: ["ext-sample-report"], skills: ["sample-ops"],
    },
  ];
}

function marketplace(installed: Set<string>, versions: Map<string, string>): Marketplace {
  const entries: Omit<MarketplaceEntry, "installed" | "version" | "update">[] = [
    {
      id: "sample", src: "gh:fyso/ext-sample", catalog: "Fyso", name: "Ejemplo", name_i18n: { en: "Sample" },
      description: "Sitio estático de ejemplo", description_i18n: { en: "Sample static site" }, tags: ["demo"], latest: "v1.3.0",
    },
    {
      id: "netbird", src: "gh:fyso/fyso-ext-netbird", catalog: "Fyso", name: "NetBird",
      description: "Red privada entre hosts", description_i18n: { en: "Private network between hosts" },
      tags: ["network", "multi-host"], homepage: "https://netbird.io", latest: "v0.4.1",
    },
    {
      id: "metabase", src: "gh:acme/fyso-ext-metabase", catalog: "Acme", name: "Metabase",
      description: "Tableros sobre los datos del proyecto", description_i18n: { en: "Dashboards over project data" },
      tags: ["data"], latest: null,
    },
  ];
  return {
    collectedAt: new Date().toISOString(),
    catalogs: [{ source: "gh:fyso-dev/fyso-extensions", name: "Fyso" }, { source: "gh:acme/fyso-catalog", name: "Acme" }],
    extensions: entries.map((e) => {
      const version = versions.get(e.id) ?? null;
      const on = installed.has(e.id);
      return { ...e, installed: on, version, update: on && !!e.latest && version !== e.latest };
    }),
  };
}

function apps(scenario: Scenario): App[] {
  const framework: App[] = [
    {
      id: "dagu", name: "Dagu", name_i18n: { es: "Dagu", en: "Dagu" },
      description: "Workflows y ejecuciones", description_i18n: { en: "Workflows and runs" },
      icon: "workflow", url: PROJECT.urls.dagu, group: "framework", enabled: true,
    },
    {
      id: "omb", name: "OpenMausBot", description: "Bots y aprobaciones", description_i18n: { en: "Bots and approvals" },
      icon: "bot", url: PROJECT.urls.omb, group: "framework", enabled: true,
      accessNote: "Login del proyecto; no requiere código de emparejamiento",
      accessNote_i18n: { en: "Project login; no pairing code required" },
    },
  ];
  if (scenario === "empty") return framework;
  return [
    ...framework,
    {
      id: "drivers", name: "Choferes", name_i18n: { en: "Drivers" }, description: "Legajos y turnos",
      description_i18n: { en: "Records and shifts" }, icon: "users", url: "http://drivers.localhost:8400",
      group: "project", enabled: true,
    },
    {
      id: "deliveries", name: "Entregas", name_i18n: { en: "Deliveries" }, description: "Seguimiento por zona",
      description_i18n: { en: "Tracking by zone" }, icon: "truck", url: "http://deliveries.localhost:8400",
      group: "project", enabled: true,
    },
    {
      id: "reports", name: "Reportes", name_i18n: { en: "Reports" }, description: "Resumen semanal",
      description_i18n: { en: "Weekly summary" }, icon: "chart", url: "http://reports.localhost:8400",
      group: "project", enabled: false,
    },
    {
      id: "sample", name: "Ejemplo", name_i18n: { en: "Sample" }, description: "Extensión de ejemplo",
      description_i18n: { en: "Sample extension" }, icon: "puzzle", url: "http://sample.localhost:8400",
      group: "extension", enabled: true,
    },
  ];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

type MockRun = {
  dag: string;
  id: string;
  createdAt: number;
  duration: number;
  outcome: "succeeded" | "failed";
  error?: string;
  outputs: () => Record<string, unknown>;
  onDone?: () => void;
  done?: boolean;
  /** Runs that exist before the page loads. */
  past?: { startedAt: string; finishedAt: string };
};

/** OMB-like plan lines (prose, English), from comparing two team files by bot name. */
function planFor(applied: string, proposed: string): Plan {
  const before = new Map(readBots(parseTeam(applied)).map((b) => [b.name, b]));
  const after = readBots(parseTeam(proposed));
  const plan: string[] = [];
  let created = 0, changed = 0, unchanged = 0;
  for (const bot of after) {
    const old = before.get(bot.name);
    before.delete(bot.name);
    if (!old) {
      created++;
      plan.push(`bot "${bot.name}": create (${bot.model} · Ask · computer off)`);
      continue;
    }
    const parts: string[] = [];
    if (old.model !== bot.model) parts.push(`model ${old.model} → ${bot.model}`);
    if (old.title !== bot.title) parts.push(`title "${old.title}" → "${bot.title}"`);
    if (JSON.stringify(old.soul) !== JSON.stringify(bot.soul)) parts.push("soul changed");
    if (parts.length === 0 && old.fingerprint !== bot.fingerprint) parts.push("settings changed");
    if (parts.length) {
      changed++;
      plan.push(`bot "${bot.name}": update ${parts.join("; ")}`);
    } else unchanged++;
  }
  for (const name of before.keys()) plan.push(`bot "${name}": not in file (kept)`);
  return { plan, created, changed, unchanged, deleted: 0, warnings: [] };
}

export function createMockBackend(scenario: Scenario): Backend & { initialDraft: string | null } {
  let team = scenario === "empty" ? EMPTY_TEAM : TEAM;
  let applied = team;
  const runs = new Map<string, MockRun>();
  const latest = new Map<string, MockRun>();
  let seq = 0;
  const installed = new Set(scenario === "empty" ? [] : ["sample"]);
  const versions = new Map(scenario === "empty" ? [] : [["sample", "v1.2.0"]]);

  const check = (): SetupCheck => {
    const count = listedBots(readBots(parseTeam(team))).length;
    return {
      checkedAt: new Date().toISOString(),
      engines: engines(scenario),
      bots: { count, pending: team === applied ? 0 : 1, ok: team === applied },
      dagu: { ok: true, botsConnected: count },
    };
  };

  const add = (r: MockRun) => {
    runs.set(r.id, r);
    latest.set(r.dag, r);
    return r;
  };

  if (scenario !== "first") {
    const checkAge = scenario === "failed" ? 60_000 : 2 * 3600_000;
    const old = check();
    old.checkedAt = ago(checkAge);
    add({
      dag: DAGS.setupCheck, id: "past-check", createdAt: 0, duration: 0, outcome: "succeeded", done: true,
      outputs: () => ({ check: JSON.stringify(old) }),
      past: { startedAt: ago(checkAge + 9000), finishedAt: ago(checkAge) },
    });
    add({
      dag: DAGS.snapshot, id: "past-snapshot", createdAt: 0, duration: 0, outcome: "succeeded", done: true,
      outputs: () => ({ result: "committed 4f2a9c1" }),
      past: { startedAt: ago(12 * 60_000 + 4000), finishedAt: ago(12 * 60_000) },
    });
  }

  function status(r: MockRun): Run {
    if (r.past) return { id: r.id, statusLabel: r.outcome, ...r.past };
    const t = Date.now() - r.createdAt;
    const startedAt = new Date(r.createdAt + 500).toISOString();
    if (t < 500) return { id: r.id, statusLabel: "queued" };
    if (t < r.duration) return { id: r.id, statusLabel: "running", startedAt };
    if (!r.done) {
      r.done = true;
      if (r.outcome === "succeeded") r.onDone?.();
    }
    return {
      id: r.id, statusLabel: r.outcome, startedAt,
      finishedAt: new Date(r.createdAt + r.duration).toISOString(), error: r.error,
    };
  }

  return {
    initialDraft: scenario === "failed" || scenario === "applyfail" ? DRAFT : null,

    async getBotVersioning() { return {collectedAt:new Date().toISOString(), commit:null, bots:[]}; },
    async getRuntimeBots() { return []; },
    async getObservability() { throw new Error("Observability requires the real stack"); },
    async getProject() {
      await sleep(150);
      return PROJECT;
    },
    async getTeam() {
      await sleep(200);
      return team;
    },
    async getApps() {
      await sleep(250);
      return apps(scenario);
    },
    async getExtensions() {
      await sleep(250);
      const base = extensions(scenario);
      const extra = [...installed].filter((id) => !base.some((e) => e.id === id)).map((id): Extension => ({
        id, src: `gh:fyso/fyso-ext-${id}`, version: versions.get(id) ?? null, apps: [], secrets: [], mcpServers: [], workflows: [], skills: [],
      }));
      return [...base.map((e) => ({ ...e, version: versions.get(e.id) ?? e.version })), ...extra];
    },

    async enqueue(dag, params) {
      await sleep(200);
      const id = `mock-${++seq}`;
      const createdAt = Date.now();
      const proposed = params?.TEAM_B64 ? fromBase64Utf8(params.TEAM_B64) : team;
      switch (dag) {
        case DAGS.agentConnect:
          add({ dag, id, createdAt, duration: 1800, outcome: scenario === "failed" ? "failed" : "succeeded",
            error: scenario === "failed" ? "Assistant CLI not found on the Dagu host" : undefined,
            outputs: () => ({ result: JSON.stringify({ target: params?.TARGET, mode: params?.MODE, message: "Mock: no assistant configuration was changed" }) }) });
          break;
        case DAGS.setupCheck:
          add({ dag, id, createdAt, duration: 3500, outcome: "succeeded", outputs: () => ({ check: JSON.stringify(check()) }) });
          break;
        case DAGS.botsPlan:
          add({ dag, id, createdAt, duration: 2200, outcome: "succeeded", outputs: () => ({ plan: JSON.stringify(planFor(applied, proposed)) }) });
          break;
        case DAGS.botsApply: {
          const fail = scenario === "applyfail";
          const p = planFor(applied, proposed);
          add({
            dag, id, createdAt, duration: 4200, outcome: fail ? "failed" : "succeeded",
            error: fail ? 'openmausbot team apply: bot "Driver Desk": model claude/claude-haiku-4-5 is not available for engine claude (exit 4)' : undefined,
            outputs: () => fail ? {} : { apply: JSON.stringify({ created: p.created, changed: p.changed, deleted: p.deleted, commit: "9b7e21d" }) },
            onDone: () => {
              team = proposed;
              applied = proposed;
              add({
                dag: DAGS.snapshot, id: `${id}-snap`, createdAt: 0, duration: 0, outcome: "succeeded", done: true,
                outputs: () => ({ result: "committed 9b7e21d" }),
                past: { startedAt: new Date(createdAt).toISOString(), finishedAt: new Date().toISOString() },
              });
            },
          });
          break;
        }
        case DAGS.snapshot:
          add({ dag, id, createdAt, duration: 2600, outcome: "succeeded", outputs: () => ({ result: "committed 3c81e07" }) });
          break;
        case DAGS.extCatalog:
          add({ dag, id, createdAt, duration: 1800, outcome: "succeeded", outputs: () => ({ catalog: JSON.stringify(marketplace(installed, versions)) }) });
          break;
        case DAGS.extInstall: {
          const ext = params?.ID ?? "";
          const fail = scenario === "failed";
          const latest = marketplace(installed, versions).extensions.find((e) => e.id === ext)?.latest ?? null;
          add({
            dag, id, createdAt, duration: 3800, outcome: fail ? "failed" : "succeeded",
            error: fail ? "error: the project has uncommitted changes; commit or discard them before upgrading" : undefined,
            outputs: () => ({ result: JSON.stringify({ id: ext, mode: params?.MODE ?? "add", version: latest, commit: "5e0c1aa" }) }),
            onDone: () => {
              installed.add(ext);
              if (latest) versions.set(ext, latest);
            },
          });
          break;
        }
        default:
          throw new Error(`mock: unknown DAG ${dag}`);
      }
      return id;
    },

    async getRun(_dag, runId) {
      await sleep(80);
      const r = runs.get(runId);
      if (!r) throw new Error(`mock: run ${runId} not found`);
      return status(r);
    },

    async getOutputs(_dag, runId) {
      await sleep(80);
      return runs.get(runId)?.outputs() ?? {};
    },

    async lastRun(dag) {
      await sleep(180);
      const r = latest.get(dag);
      return r ? status(r) : null;
    },

    async probe(url) {
      await sleep(500 + Math.random() * 600);
      return !url.includes("deliveries");
    },
  };
}
