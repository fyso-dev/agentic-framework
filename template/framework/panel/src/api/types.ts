// Data shapes from docs/panel-contract.md. Keep in sync with the contract.

export type Project = {
  name: string;
  slug: string;
  env: "local" | "server";
  urls: { dagu: string; omb: string };
  /** Template revision and source from .copier-answers.yml (fyso-update). */
  framework?: { commit: string | null; src: string | null };
};

export type App = {
  id: string;
  name: string;
  name_i18n?: Record<string, string>;
  description: string;
  description_i18n?: Record<string, string>;
  icon: string;
  url: string;
  group: "framework" | "project" | "extension";
  enabled: boolean;
  accessNote?: string;
  accessNote_i18n?: Record<string, string>;
};

export type Health = "ok" | "down" | "unknown";

/** `GET /config/extensions.json`, docs/extensions-contract.md §5. Secret values are never sent. */
export type ExtensionSecret = {
  name: string;
  description?: string;
  description_i18n?: Record<string, string>;
  /** Page where the value is obtained (HTTPS). */
  url?: string;
  required: boolean;
  set: boolean;
};

/** Counter an extension page declares (extensions-contract §9): the panel counts matching Dagu runs. */
export type ExtensionPageBadge = { dagu_runs: { status: "waiting"; labels: string[] }; warn_labels?: string[]; attention?: boolean };
export type ExtensionPageRegistration = {id:string; name:string; name_i18n?:Record<string,string>; url:string; icon?:string; badge?:ExtensionPageBadge};

export type Extension = {
  id: string;
  src: string;
  version: string | null;
  apps: string[];
  secrets: ExtensionSecret[];
  mcpServers: string[];
  workflows: string[];
  skills: string[];
  pages?: ExtensionPageRegistration[];
  /** Setup step the extension adds (`extensions/<ext>/setup.yaml`, D51). */
  setup?: { title: string; title_i18n?: Record<string, string>; description?: string; description_i18n?: Record<string, string> };
};

/** Output `catalog` of `fyso-ext-catalog` (docs/extensions-contract.md §8). */
export type MarketplaceEntry = {
  id: string;
  src: string;
  catalog: string;
  name: string;
  name_i18n?: Record<string, string>;
  description: string;
  description_i18n?: Record<string, string>;
  tags: string[];
  homepage?: string;
  /** Highest version tag of the extension repo, read live. */
  latest: string | null;
  installed: boolean;
  /** Installed version (`_commit`), when installed. */
  version: string | null;
  update: boolean;
  error?: string;
  errorCode?: "githubAccess";
};

export type Marketplace = {
  collectedAt: string;
  catalogs: { source: string; name: string; error?: string; errorCode?: "githubAccess" }[];
  extensions: MarketplaceEntry[];
};

/** Output `result` of `fyso-ext-install`. */
export type UpdateResult = { from: string | null; to: string | null; commit: string | null; changed: boolean };

export type ExtInstallResult = { id: string; mode: "add" | "update"; version: string | null; commit: string };

/** Third-party skills (D64, docs/third-party-skills.md). `GET /config/skills.json` lists the installed ones. */
export type ThirdPartySkill = {
  name: string;
  description: string;
  src: string;
  path: string;
  /** Commit of the source the copy is pinned to. */
  commit: string;
  license: string | null;
  licenseFile: string | null;
  licenseTitle: string | null;
  /** SHA-256 of the retained folder: what the scan and the confirmation refer to. */
  sha256: string;
  files: number;
  installedAt: string;
  scan: { at: string; warnings: string[] } | null;
  review: { at: string } | null;
  /** modified: edited locally · scan: not scanned yet · review: waiting for a person · ready: can be switched on per bot. */
  state: "modified" | "scan" | "review" | "ready";
  /** Bots of team.yaml that have it on. */
  bots: string[];
};

export type SkillHit = {
  name: string;
  description?: string;
  license?: string | null;
  licenseFile?: string | null;
  licenseTitle?: string | null;
  src: string;
  path?: string;
  commit?: string;
  /** source: a git repository of project/skill-sources.yaml · directory: named by skills.sh. */
  origin: "source" | "directory";
  installs?: number;
  url?: string;
  installed: boolean;
  update?: boolean;
};

/** What a person reads before installing or confirming. `skillMd` is third-party text: shown, never rendered as HTML. */
export type SkillDetail = Omit<SkillHit, "origin" | "installed"> & {
  sha256: string;
  skillMd: string;
  licenseText?: string;
  files: string[];
  installed?: boolean;
  installedCommit?: string;
};

/** Output `catalog` of `fyso-skills-catalog`: a search, one skill of a source, or one installed skill. */
export type SkillCatalog = {
  collectedAt: string;
  planId?: string;
  query?: string;
  sources?: { source: string; count?: number; error?: string; skipped?: boolean }[];
  skills?: SkillHit[];
  installed?: ThirdPartySkill[];
  preview?: SkillDetail;
  local?: Omit<ThirdPartySkill, "files"> & { skillMd: string; licenseText?: string; files: string[] };
};

/** Output `result` of `fyso-skills-install`. */
export type SkillResult = { op: string; name: string; commit: string | null; skill: ThirdPartySkill | null; changed?: boolean; from?: string; to?: string };

export type Engine = {
  id: string;
  label: string;
  kind: "subscription" | "api";
  ok: boolean;
  models: string[];
  fixHint?: string;
};

/** Output `check` of `fyso-setup-check`. */
export type SetupCheck = {
  checkedAt: string;
  /** Extension Setup steps (D51): pending while a required secret is empty, then the extension's doctor. */
  extensions?: { id: string; state: "done" | "pending" | "failed" }[];
  engines: Engine[];
  /** `error`: OpenMausBot rejected the team file (e.g. a model the engine no longer offers). */
  bots: { count: number; pending: number; ok: boolean; error?: string };
  dagu: { ok: boolean; botsConnected: number };
};

/** Output `plan` of `fyso-bots-plan`, including scoped removals. */
export type Plan = {
  plan: string[];
  created: number;
  changed: number;
  unchanged: number;
  deleted: number;
  warnings?: unknown[];
  removalRevision?: string;
};

/** Output `apply` of `fyso-bots-apply`. */
export type ApplyResult = { created: number; changed: number; deleted: number; commit: string };

/** A Dagu run, reduced to what the panel needs. */
export type Run = {
  id: string;
  statusLabel: string;
  startedAt?: string;
  finishedAt?: string;
  /** First step error reported by Dagu, shown verbatim. */
  error?: string;
};

/** Action workflows (contract §3). Dagu DAG names. */
export const DAGS = {
  agentConnect: "fyso-agent-connect",
  botArchitect: "fyso-bot-architect",
  observability: "fyso-observability",
  setupCheck: "fyso-setup-check",
  botsPlan: "fyso-bots-plan",
  botsApply: "fyso-bots-apply",
  snapshot: "fyso-snapshot",
  extCatalog: "fyso-ext-catalog",
  extInstall: "fyso-ext-install",
  skillsCatalog: "fyso-skills-catalog",
  skillsInstall: "fyso-skills-install",
  update: "fyso-update",
} as const;

export type BotAppearance = {
  avatarUrl?: string | null; color?: string; mascotBody?: string | null; mascotFaceColor?: string | null;
  avatarCrop?: string | null; avatarZoom?: number; avatarFocusX?: number; avatarFocusY?: number;
};
export type RuntimeBot = BotAppearance & { id: string; name: string; title?: string; section?: string; modelSelection?: { instanceId?: string; model?: string };toolScope?:import('../lib/connector-access').ToolScope;mcpServers?:string[]|null };

export type BotVersioning = { collectedAt: string; commit: string | null; projectDirty?: boolean; bots: {name: string; team: string; project: boolean; snapshot: boolean}[] };

export type Backend = {
  getBotVersioning(): Promise<BotVersioning>;
  getRuntimeBots(): Promise<RuntimeBot[]>;
  getObservability(): Promise<import("./observability").Observation>;
  getProject(): Promise<Project>;
  getTeam(): Promise<string>;
  getApps(): Promise<App[]>;
  getExtensions(): Promise<Extension[]>;
  getSkills(): Promise<ThirdPartySkill[]>;
  /** Always `enqueue`, never `start` (contract §2). Returns the dagRunId. */
  enqueue(dag: string, params?: Record<string, string>): Promise<string>;
  getRun(dag: string, runId: string): Promise<Run>;
  getOutputs(dag: string, runId: string): Promise<Record<string, unknown>>;
  lastRun(dag: string): Promise<Run | null>;
  probe(url: string): Promise<boolean>;
};

export type Visual = "never" | "running" | "ok" | "failed";

/** Status mapping from contract §2. */
export function visualOf(statusLabel: string | undefined): Visual {
  switch (statusLabel) {
    case "running":
    case "queued":
    case "waiting":
      return "running";
    case "succeeded":
    case "partially_succeeded":
      return "ok";
    case "failed":
    case "aborted":
    case "rejected":
      return "failed";
    default:
      return "never";
  }
}
