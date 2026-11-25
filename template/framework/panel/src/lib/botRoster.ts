import type { BotAppearance, RuntimeBot } from "../api/types";
import type { BotRow } from "./team";

export type RosterRow = {
  key: string;
  nativeId?: string;
  team?: string;
  ambiguous?: boolean;
  name: string;
  title: string;
  model: string;
  appearance?: BotAppearance;
  configuration?: BotRow;
  /** OpenMausBot's default MausBot: configured in OpenMausBot, never in the panel's form. */
  defaultChief?: boolean;
};

/** Native IDs identify live rows; only unique names can link to a team-file form. */
export function botRoster(configuration: BotRow[], runtime: RuntimeBot[] | null, defaultChiefs: string[] = []): RosterRow[] {
  const fromConfig = (row: BotRow): RosterRow => ({
    key: `config-${row.bot.index}-${row.bot.name}-${row.state}`,
    team: row.bot.team, name: row.bot.name, title: row.bot.title, model: row.bot.model, configuration: row,
  });
  if (runtime === null) return configuration.map(fromConfig);
  const matched = new Set<BotRow>();
  const rows = runtime.map(bot => {
    const named = configuration.filter(row => row.bot.name === bot.name);
    // OMB matches by name and prefers the bot in the same team (D81).
    const sameTeam = named.filter(row => row.bot.team === (bot.section || ""));
    const candidates = named.length > 1 && sameTeam.length ? sameTeam : named;
    const unique = runtime.filter(other => other.name === bot.name).length === 1;
    const config = unique && candidates.length === 1 ? candidates[0] : undefined;
    if (config) matched.add(config);
    const pending = config && config.state !== "applied";
    return {
      key: bot.id,
      nativeId: bot.id,
      team: pending ? config.bot.team : bot.section || "",
      appearance: bot,
      ambiguous: !unique,
      name: pending ? config.bot.name : bot.name,
      title: pending ? config.bot.title : bot.title || "",
      model: pending ? config.bot.model : [bot.modelSelection?.instanceId, bot.modelSelection?.model].filter(Boolean).join("/"),
      configuration: config,
      defaultChief: unique && !bot.section && defaultChiefs.includes(bot.name),
    };
  });
  // Unapplied drafts remain visible. An unchanged declaration must not resurrect
  // a bot removed in the native UI, or duplicate an ambiguous live identity.
  return [...rows, ...configuration.filter(row => !matched.has(row) && row.state !== "applied").map(fromConfig)];
}

export type TeamGroup = { team: string; rows: RosterRow[] };

/**
 * Group the roster by OMB team, in the file's team order, then any other team the
 * bots name; bots without a team come first, under OMB's default "General" (D81).
 */
export function groupByTeam(rows: RosterRow[], declared: string[] = []): TeamGroup[] {
  const order: string[] = [""];
  const known = (team: string) => order.find(t => t.toLowerCase() === team.toLowerCase());
  for (const team of [...declared, ...rows.map(r => r.team || "")]) if (known(team) === undefined) order.push(team);
  const groups = order.map(team => ({ team, rows: rows.filter(r => known(r.team || "") === team) }));
  // A declared department stays visible while empty, so it can be filled (D81).
  return groups.filter(g => g.rows.length > 0 || (!!g.team && declared.some(d => d.toLowerCase() === g.team.toLowerCase())));
}

export function versionStatus(row: RosterRow, inventory: import('../api/types').BotVersioning | undefined): 'project' | 'snapshot' | 'native' | 'unknown' {
  if (!inventory?.commit || row.ambiguous) return 'unknown';
  const recorded = inventory.bots.find(bot => bot.name === row.name && bot.team === (row.team || ''));
  return recorded?.project ? 'project' : recorded?.snapshot ? 'snapshot' : 'native';
}

/**
 * A committed bot missing from the current form data is still synchronizing, except
 * the default MausBot: the form never lists it, so it is configured in OpenMausBot.
 */
export function unmatchedVersion(row: RosterRow, inventory: import('../api/types').BotVersioning | undefined, synchronized: boolean) {
  if (row.defaultChief) return 'chief';
  const status = versionStatus(row, inventory);
  if (status === 'project') return 'syncing';
  return synchronized ? status : 'unknown';
}
