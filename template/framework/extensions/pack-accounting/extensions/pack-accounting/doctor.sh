#!/usr/bin/env bash
# The pack is a valid native team file and every soul it names exists.
set -euo pipefail
command -v node >/dev/null || { echo "node missing: run mise install" >&2; exit 1; }
cd "${FYSO_ROOT:?}"
node framework/scripts/render-team.cjs extensions/pack-accounting/team.yaml | node -e '
  let text = "";
  process.stdin.on("data", chunk => text += chunk).on("end", () => {
    const team = JSON.parse(text), fs = require("node:fs");
    if (team.version !== 1 || !Array.isArray(team.bots) || !team.bots.length) throw new Error("team.yaml: no bots");
    for (const bot of team.bots) {
      if (!bot.name || !bot.model || !bot.soul || !fs.existsSync(bot.soul.file)) throw new Error(`team.yaml: ${bot.name || "a bot"} is incomplete`);
      if (bot.approval !== "ask") throw new Error(`team.yaml: ${bot.name} must ask before acting`);
    }
  });
'
test -f extensions/pack-accounting/souls/rules.md || { echo "souls/rules.md is missing" >&2; exit 1; }
