# SilverBullet extension verification

> This records the first run (2026-11-09), on the template as it was before the
> extension was ported to the current framework. The current verification is in
> the [extension contract](../../../docs/silverbullet-extension.md).

Verified locally on 2026-11-09 using a generated temporary project with port base
29400 (SilverBullet 29410). This evidence contains no customer documentation.

| Check | Observed result |
|---|---|
| Parent Copier generation | Bundled `copier.yml` and `.slotjinja` templates preserved |
| Extension install | `ext:add` generated process, Caddy route, app tile, skill and MCP |
| Pinned tools | SilverBullet 2.12.1 and official filesystem MCP 2.2.0 installed by mise |
| Real integration suite | 4 passed, zero skips |
| Existing extension suite | 8 passed |
| Full generated stack | `mise run doctor` passed, including extension and instance isolation |
| Real bot MCP | Claude Workflow Architect read the synthetic page at 19:32 UTC |
| Repository checks | `git diff --check`, shell syntax and `scripts/check-paths.sh` passed |

[agent-mcp-proof.json](agent-mcp-proof.json) records filtered native OMB tool
events, not just the bot's final assertion. The first tool request used a doubled
relative path and failed; a second call to `index.md` succeeded and returned the
starter heading. No document changes were requested in this probe.

The first conversation also exposed that OMB does not pass `FYSO_ROOT` to bots.
The launcher now derives the root from its own location; the automated MCP test
removes that variable to prevent regression.

The fixture stack was stopped after verification. Existing user services and
the pre-existing panel changes were preserved. No screenshot, production
deployment, live-user installation, Linux/Windows run or Git publication is
asserted. See the [extension contract](../../../docs/silverbullet-extension.md)
for reproduction commands and operational limits.
