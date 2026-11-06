import type { RuntimeBot } from "../api/types";
import type { BotRow } from "./team";

export type RosterRow = {
  key: string;
  nativeId?: string;
  team?: string;
  ambiguous?: boolean;
  name: string;
  title: string;
  model: string;
  configuration?: BotRow;
};

/** Native IDs identify live rows; only unique names can link to a team-file form. */
export function botRoster(configuration: BotRow[], runtime: RuntimeBot[] | null): RosterRow[] {
  const fromConfig = (row: BotRow): RosterRow => ({
    key: `config-${row.bot.index}-${row.bot.name}-${row.state}`,
    name: row.bot.name, title: row.bot.title, model: row.bot.model, configuration: row,
  });
  if (runtime === null) return configuration.map(fromConfig);
  const matched = new Set<BotRow>();
  const rows = runtime.map(bot => {
    const candidates = configuration.filter(row => row.bot.name === bot.name);
    const unique = runtime.filter(other => other.name === bot.name).length === 1;
    const config = unique && candidates.length === 1 ? candidates[0] : undefined;
    if (config) matched.add(config);
    const pending = config && config.state !== "applied";
    return {
      key: bot.id,
      nativeId: bot.id,
      team: bot.section || "",
      ambiguous: !unique,
      name: pending ? config.bot.name : bot.name,
      title: pending ? config.bot.title : bot.title || "",
      model: pending ? config.bot.model : [bot.modelSelection?.instanceId, bot.modelSelection?.model].filter(Boolean).join("/"),
      configuration: config,
    };
  });
  // Unapplied drafts remain visible. An unchanged declaration must not resurrect
  // a bot removed in the native UI, or duplicate an ambiguous live identity.
  return [...rows, ...configuration.filter(row => !matched.has(row) && row.state !== "applied").map(fromConfig)];
}

export function versionStatus(row: RosterRow, inventory: import('../api/types').BotVersioning | undefined): 'project' | 'snapshot' | 'native' | 'unknown' {
  if (!inventory?.commit || row.ambiguous) return 'unknown';
  const recorded = inventory.bots.find(bot => bot.name === row.name && bot.team === (row.team || ''));
  return recorded?.project ? 'project' : recorded?.snapshot ? 'snapshot' : 'native';
}
