// Read and edit OpenMausBot's team file with the `yaml` Document API, which keeps
// comments and key order (contract §4). Only the form's fields are touched.
import { Document, isMap, isScalar, isSeq, parseDocument, Scalar, YAMLMap, YAMLSeq } from "yaml";
import type { ToolScope } from './connector-access';

// team.yaml holds `${VAR}` placeholders that the framework substitutes before calling
// OMB. Inside a YAML flow map (`soul: { file: ${FYSO_ROOT}/… }`) the braces are not
// valid YAML, so they are swapped for a plain token while parsing and restored on output.
const ENV_IN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
const ENV_OUT = /__ENV_([A-Za-z_][A-Za-z0-9_]*?)_ENV__/g;
const encodeEnv = (text: string) => text.replace(ENV_IN, "__ENV_$1_ENV__");
export const decodeEnv = (text: string) => text.replace(ENV_OUT, (_, name: string) => `\${${name}}`);

/** "Uses workflows" means the bot runs in the project root, where `.mcp.json` lives. */
export const ROOT_CWD = encodeEnv("${FYSO_ROOT}");
export const SOUL_MAX_BYTES = 24000;
export const SOUL_WARN_BYTES = 22000;
export const NAME_MAX = 100;

export type Approval = "ask" | "full";

export type Soul = { kind: "inline"; text: string } | { kind: "file"; file: string } | { kind: "none" };

export type Bot = {
  /** Position in the `bots` sequence of the document. */
  index: number;
  name: string;
  title: string;
  model: string;
  engine: string;
  modelId: string;
  chief: boolean;
  /** OMB approval mode: ask before acting, or act without asking. */
  approval: Approval;
  soul: Soul;
  skills: string[];
  /** `file` of each skill entry, as written in team.yaml (`${FYSO_ROOT}/…`). */
  skillFiles: string[];
  usesWorkflows: boolean;
  tools?: ToolScope;
  /** Canonical JSON of the bot node, to compare a draft with the file. */
  fingerprint: string;
};

export type BotInput = {
  name: string;
  title: string;
  model: string;
  /** New inline instructions, or null to keep the current soul untouched. */
  soulText: string | null;
  usesWorkflows: boolean;
  /** Omit to keep the current value. */
  approval?: Approval;
  /** Omit to preserve the existing native selection. */
  tools?: ToolScope;
  /** Extension and third-party skills to switch on or off, by team file path. Others stay untouched. */
  skills?: { file: string; on: boolean }[];
};

/** Team file path of a skill shipped by an extension (extensions-contract §2). */
export const extensionSkillFile = (ext: string, skill: string) =>
  `\${FYSO_ROOT}/extensions/${ext}/skills/${skill}/SKILL.md`;

/** Team file path of an installed third-party skill (docs/third-party-skills.md). */
export const thirdPartySkillFile = (name: string) => `\${FYSO_ROOT}/project/bots/skills/${name}/SKILL.md`;

export function parseTeam(text: string): Document {
  return parseDocument(encodeEnv(text));
}

/** The document as team.yaml text, with `${VAR}` placeholders restored. */
export function serializeTeam(doc: Document): string {
  return decodeEnv(doc.toString());
}

export function splitModel(model: string): { engine: string; modelId: string } {
  const i = model.indexOf("/");
  return i < 0 ? { engine: "", modelId: model } : { engine: model.slice(0, i), modelId: model.slice(i + 1) };
}

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

function botsSeq(doc: Document): YAMLSeq | null {
  const seq = doc.get("bots", true);
  return isSeq(seq) ? seq : null;
}

function defaultCwd(doc: Document): string {
  return str(doc.getIn(["defaults", "cwd"]));
}

function readSoul(node: unknown): Soul {
  if (isScalar(node) && typeof node.value === "string") return { kind: "inline", text: decodeEnv(node.value) };
  if (isMap(node)) {
    const file = node.get("file");
    if (typeof file === "string") return { kind: "file", file: decodeEnv(file) };
  }
  return { kind: "none" };
}

function readSkills(node: unknown): string[] {
  if (!isSeq(node)) return [];
  return node.items.filter(skillEnabled).map((it) => {
    if (isScalar(it)) return decodeEnv(str(it.value));
    if (isMap(it)) return skillLabel(decodeEnv(str(it.get("file") ?? it.get("name") ?? it.get("id") ?? it.get("path"))));
    return "";
  }).filter(Boolean);
}

/** `…/skills/<name>/SKILL.md` → `<name>`: OMB's native entries are `{ file }`. */
const skillLabel = (v: string) => /([^/]+)\/SKILL\.md$/.exec(v)?.[1] ?? v;

const skillFile = (it: unknown) => (isMap(it) ? decodeEnv(str(it.get("file"))) : "");
/** OMB's native switch: an entry is on unless it says `enabled: false`. */
const skillEnabled = (it: unknown) => !(isMap(it) && it.get("enabled") === false);

function readSkillFiles(node: unknown): string[] {
  return isSeq(node) ? node.items.filter(skillEnabled).map(skillFile).filter(Boolean) : [];
}

// OMB's team apply only adds and updates: a skill left out of the file stays installed
// and on. So switching off keeps the entry with the native `enabled: false`.
function setSkill(doc: Document, map: YAMLMap, file: string, on: boolean) {
  const node: unknown = map.get("skills", true);
  const entry = isSeq(node) ? node.items.find((it) => skillFile(it) === file) : undefined;
  if (isMap(entry)) {
    if (on) entry.delete("enabled");
    else entry.set("enabled", false);
    return;
  }
  if (!on) return;
  const seq = isSeq(node) ? node : (doc.createNode([]) as YAMLSeq);
  if (seq !== node) map.set("skills", seq);
  seq.add(doc.createNode({ file: encodeEnv(file) }));
}

export function readBots(doc: Document): Bot[] {
  const seq = botsSeq(doc);
  if (!seq) return [];
  const rootCwd = defaultCwd(doc);
  return seq.items.flatMap((item, index) => {
    if (!isMap(item)) return [];
    const model = str(item.get("model"));
    const cwd = item.has("cwd") ? str(item.get("cwd")) : rootCwd;
    const tools = item.has("tools") ? item.get("tools",true) : doc.getIn(["defaults","tools"],true);
    return [{
      index,
      name: decodeEnv(str(item.get("name"))),
      title: decodeEnv(str(item.get("title"))),
      model,

      ...splitModel(model),
      chief: item.get("chief") === true,
      approval: (item.has("approval") ? str(item.get("approval")) : str(doc.getIn(["defaults", "approval"]))) === "full" ? "full" : "ask",
      soul: readSoul(item.get("soul", true)),
      skills: readSkills(item.get("skills", true)),
      skillFiles: readSkillFiles(item.get("skills", true)),
      usesWorkflows: cwd === ROOT_CWD,
      tools: isMap(tools) ? tools.toJSON() as ToolScope : undefined,
      fingerprint: JSON.stringify(item.toJSON()),
    }];
  });
}

/** Bots the panel lists: the chief bot (OpenMausBot's default MausBot) is not managed here. */
export const listedBots = (bots: Bot[]) => bots.filter((b) => !b.chief);

function soulNode(doc: Document, text: string): Scalar {
  const node = doc.createNode(encodeEnv(text.endsWith("\n") ? text : `${text}\n`)) as Scalar;
  node.type = Scalar.BLOCK_LITERAL;
  return node;
}

function applyInput(doc: Document, map: YAMLMap, input: BotInput) {
  if(input.tools!==undefined)map.set('tools',doc.createNode(input.tools));
  map.set("name", input.name.trim());
  if (input.title.trim()) map.set("title", input.title.trim());
  else map.delete("title");
  map.set("model", input.model);
  if (input.approval !== undefined) map.set("approval", input.approval);
  if (input.soulText !== null) {
    if (input.soulText.trim()) map.set("soul", soulNode(doc, input.soulText));
    else map.delete("soul");
  }
  if (input.usesWorkflows) {
    const cwd = map.has("cwd") ? str(map.get("cwd")) : defaultCwd(doc);
    if (cwd !== ROOT_CWD) {
      if (defaultCwd(doc) === ROOT_CWD) map.delete("cwd");
      else map.set("cwd", ROOT_CWD);
    }
  }
  for (const k of input.skills ?? []) setSkill(doc, map, k.file, k.on);
}

/** Update the bot at `index`, or append a new one when `index` is null. */
export function upsertBot(doc: Document, index: number | null, input: BotInput, declaredName?: string) {
  let seq = botsSeq(doc);
  if (!seq) {
    seq = doc.createNode([]) as YAMLSeq;
    doc.set("bots", seq);
  }
  if (index === null) {
    const map = doc.createNode({}) as YAMLMap;
    applyInput(doc, map, input);
    // Keep the file's style: a blank line between bots if the others have one.
    map.spaceBefore = seq.items.some((it) => isMap(it) && it.spaceBefore);
    seq.add(map);

    return;
  }
  const map = seq.get(index, true);
  if (!isMap(map)) throw new Error(`bots[${index}] is not a map`);
  if (declaredName && declaredName !== input.name.trim()) map.set("was", declaredName);
  applyInput(doc, map, input);
}

export function removeBot(doc: Document, index: number) {
  botsSeq(doc)?.delete(index);
}

export function base64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64Utf8(b64: string): string {
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export const byteLength = (text: string) => new TextEncoder().encode(text).length;

/** Display path of a soul file, without the project root prefix. */
export const soulFileLabel = (file: string) => file.replace(/^\$\{FYSO_ROOT\}\/?/, "");

export type BotState = "applied" | "pending" | "new" | "deleted";

export type BotRow = { bot: Bot; state: BotState };

/** Compare the draft with the team file on disk, by bot name (OMB matches bots by name). */
export function diffBots(base: Bot[], draft: Bot[]): BotRow[] {
  const byName = new Map(base.map((b) => [b.name, b]));
  const rows: BotRow[] = draft.map((bot) => {
    const old = byName.get(bot.name);
    return { bot, state: !old ? "new" : old.fingerprint === bot.fingerprint ? "applied" : "pending" };
  });
  const names = new Set(draft.map((b) => b.name));
  for (const bot of base) if (!names.has(bot.name)) rows.push({ bot, state: "deleted" });
  return rows;
}
