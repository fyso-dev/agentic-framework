# Operations assistant

What your bots did, what failed, what it cost; routines turned into workflows; and an
alert when a bot spends more than you decided.

## Weekly digest

`ext-ops-assistant-digest` writes one wiki page, `Resumen semanal/<date>`
(`Weekly digest/<date>`), on the schedule chosen at install (default: Mondays 08:00,
server time; each run creates a new page): conversations per bot, workflow runs and failures, the month's cost per
bot and the state of the spend caps. It reads the same data as the panel's
Observability page and uses no AI. Run it now with `mise run ops-assistant:digest`, or
ask a bot with Dagu access to run the workflow and read you the page.

Amounts are what OpenMausBot and the coding engines report, not an invoice. "Unknown"
means a tool reported no cost; it is never shown as zero.

## "Automate this"

Switch the `automate-this` skill on for a bot that can change workflows (panel →
Bots → a bot → Profile → Skills). Describe the routine; the bot asks what is missing,
shows the workflow as a preview, creates it only after your yes, tests it and tells
you when it runs next.

## Extension maintenance

In **Automations**, run `ext-ops-assistant-maintenance` with the extension ID
in `EXTENSION` and a sanitized error description in `REPORT`. Choose the
operation that matches the failed step:

- `recover` resumes activation when Copier already installed or updated the
  extension. It refreshes project config, retries tool installation, reloads
  the running stack through the normal extension lifecycle.
- `add` retries installation using the project's marketplace catalog.
- `update` retries the upgrade using the installed extension's Copier source.

These operations run as the project's service user on the host. The workflow
runs `doctor` after a successful operation. The report
stays in the maintenance run. Inspect the `fyso-ext-install` child for the
result and its logs. Grant `ext-ops-assistant-maintenance` explicitly to the
maintenance bot's scoped Dagu MCP if it should be able to run these operations.

## Monthly spend cap per bot

Add the caps to `project/observability.json` (the file the Observability page
already uses) and commit:

```json
{
  "botMonthlyUsd": { "Soporte": 20, "*": 50 },
  "botMonthlyUsdBasis": "api"
}
```

- Keys are bot names; `"*"` is the cap for every other bot. Amounts in USD per
  calendar month (UTC).
- `"api"` (default) counts API cost. `"all"` also counts the subscription equivalent,
  for teams whose bots run on Claude or Codex subscriptions: that is an estimate of
  use, not money charged.
- `ext-ops-assistant-spend-cap` checks on the schedule chosen at install (default:
  daily 09:00). The first time a bot goes over its cap in a month **the run fails**,
  so it shows red in Dagu and in the panel's Observability alerts. The weekly digest
  lists every bot's state, including those above 80%.
- The scheduled check also fails when spend data is incomplete and no exceedance is
  known, because it cannot verify the caps.
- `mise run ops-assistant:spend` shows the figures now.

**It alerts; it does not pause anything.** OpenMausBot's own limit is one amount for
the whole workspace and needs its paid `budgets` feature; there is no per-bot switch
to turn. To stop a bot, change or remove it in the panel.

## Limits

- The digest covers what the observability export keeps (the current month, the last
  100 workflow runs). A week that crosses a month boundary is partial, and the page
  says when figures may be incomplete.
- The export has monthly usage groups, not weekly trace costs. Costs are month-to-date
  per bot; no weekly amount is inferred from conversation traces. Missing, stale, invalid or
  unavailable spend data stays unverified, never within cap.
