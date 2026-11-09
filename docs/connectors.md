# Connector management in the panel (D42)

The panel has a dedicated **Connectors** tab at `#/connectors`. It reuses native
OpenMausBot APIs for app discovery, accounts, MCP management, connection probes and
OAuth. People stay in the panel; only provider authorization opens another window.
The framework does not implement another OAuth client or tool executor.

## User flow

1. Open **Connectors** from the panel navigation.
2. For an app, search the native catalog and choose Connect. Adding another account
   opens an account-name field inside that app card.
   The named connection dialog prepares a link without opening a blank tab. Choose
   **Open <app> authorization**, sign in and approve permissions in the new tab,
   then return to Fyso. Connection state is checked automatically on return and
   every three seconds while this tab is visible. **I authorized my account · check**
   remains an explicit fallback; providers requiring a pasted callback retain that field.
   The confirmation dialog leads back to the connected card. Temporary check failures
   are explained and can recover without restarting authorization. Cancel stops
   local checking and invalidates late results; it does not revoke an existing account.
   Additional accounts require distinct names; disconnect targets one exact account.
3. For an MCP server, choose **Add MCP**, then enter its URL or executable and
   arguments (one argument per line). Optional credentials use a write-only header
   field. Save and test discovers actual tools; failed or unauthorized servers stay
   disabled. Remote servers can start native OAuth from the same card.
4. Use Test, Enable/Disable or Remove on the server's card. Remove uses a focused
   confirmation dialog. Existing project-declared connectors are listed separately
   and remain owned by their project/extension source files.
5. Under **Connectors per bot**, select a bot and its MCP servers. Partial native
   selections are labeled explicitly. Preview changes, inspect the native result
   and apply the exact plan. Other servers and native tool selectors are preserved.

Bot changes use the existing versioned Bot Architect workflow. Connector/account
operations go directly through narrowly allowed Caddy routes to OMB; secret values
and callback URLs never become Dagu parameters. Native header/environment values
are redacted by OMB's list endpoint. The screen renders names, state and tool
metadata rather than saved commands, addresses or credentials. Provider failures
use localized generic messages rather than arbitrary upstream response bodies.

App accounts and toolkit grants remain native OMB state. The panel manages application
grants through the separate versioned native app-access workflow below; MCP selections
retain their existing team-file draft flow. Composio must be
configured in this project's encrypted secrets before native app authorization is
available. The native fallback app catalog remains browsable without credentials,
with a setup notice and disabled Connect buttons. Custom MCP is independent.

Example native bot patch, encoded as `BOT_B64` for the existing architect workflow:

```json
{"tools":{"allow":["native:*","mcp:dagu:dagu_read"]}}
```

Discover actual tool names in OMB; the example is not a promise that the installed
server exposes that name. A selector `mcp:server:*` permits every tool on that
server, including writes. Keep approvals independent from connector selection.
Codex cannot narrow engine-native tools and requires `native:*` in explicit
allowlists. Native OMB dry-run validates each engine's supported selection.

The tools object replaces the existing selection. Read the current bot first,
preserve unrelated selectors, and omit `tools` to preserve all existing access.
For Codex, `{"allow":["native:*"]}` removes MCP access while retaining engine-native
tools. `{"allow":[]}` is accepted only by engines that support native filtering.
Native tool selection is not a sandbox for shell commands or network access.

## Framework bot defaults

New projects declare explicit native tool selections:

| Bot | MCP access |
|---|---|
| Workflow Architect | Dagu tools |
| Run Operator | `dagu_read` and `dagu_execute`, with its existing ask approval |
| Builder | Dagu tools |
| Bot Architect | Project `fyso` tools; its CLI workflow remains available |

All retain `native:*` for engine compatibility. Chief retains native OMB defaults.
These are tool-catalog selections, not shell isolation. `dagu_execute` can perform
operations beyond retry/stop; its server-side authorization and approvals still
apply. Existing project-owned team files are not overwritten by Copier updates.
Apply equivalent patches deliberately through Bot Architect after reviewing the
existing role's connectors. The optional Biz extension owns its own bot profile; new Biz Partner bots select
only `native:*` and `mcp:fyso-biz:*`. Existing Biz Partner profiles remain intact.

## Sources and restoration

| Source | What is reproduced from Git | What still requires setup |
|---|---|---|
| `framework/mcp.json`, `project/mcp.json`, `extensions/*/mcp.json` | Native server definitions merged into `.mcp.json` | Secret provisioning and any required sign-in |
| `project/bots/team.yaml`, `state/bots/team.yaml` | Native `tools` selection | Availability and authorization of its referenced connections |
| Native-only OMB MCP settings | Not included in the existing team snapshot | Recreate the server and sign in after a clean restore |
| OMB connected apps | Account grants remain native OMB state | Reconnect accounts and verify native Access settings |

Keep reproducible custom definitions in existing project/extension MCP slots and
secret references in the encrypted project secret file. Do not save secret values
in JSON, instructions or the panel. This change does not export native OMB keys or
OAuth sessions into Git, nor does it claim native-only connections are portable.
The inventory labels them explicitly. Duplicate native/project names indicate two
sources, not proof that their definitions match; use one source deliberately.

The inventory projects only names, source paths, enabled state and portability;
it does not expose URLs, commands, arguments, headers, environment values or account
identities. It never probes external services. Tools plans reject missing servers,
disabled native-only servers and native per-bot exclusions before mutation. A
connection revision invalidates a plan if its catalog/source changes before apply.

## Guided Composio setup (D44)

Open Connectors and choose **Set up Composio**. The form links directly to Composio project API Keys, explains project selection and returning to Fyso, and accepts the key in a password field. **Save and verify** checks project Auth Configs access, stores the key encrypted and activates OMB immediately. The person can then choose an app and complete native OAuth. No terminal or secret editor is part of the panel flow.

`POST /api/composio/setup` is the only setup route. The gateway requires the native web session and panel ACL; it injects the project technical Basic identity into the private Unix-socket adapter. The adapter requires that identity, exact panel origin, JSON content type and a bounded body containing only `apiKey`. Arbitrary native config patches and caller-selected upstream URLs are rejected. The key is never returned, logged, passed in command arguments, sent to Dagu or stored in browser persistence. The browser clears the field on submission and on cancel.

The adapter reads `GET https://backend.composio.dev/api/v3.1/auth_configs?limit=1` to verify access without creating a session or account. It uses `sops set --value-stdin` to update only `FYSO_COMPOSIO_API_KEY` in `secrets.enc.yaml`, preserves existing entries and commits only that encrypted file. Pending manual edits are rejected. A save failure leaves native OMB unchanged and restores the prior encrypted file. Native activation failure is reported separately from a successful encrypted save; retrying the form retries activation.

OMB's native `PATCH /api/config` activates the project key; its private runtime credential representation remains native OMB behavior. The project source of truth is the encrypted file. `run-omb.sh` reads that current key at startup so stale supervisor environment values cannot replace a later panel update. No personal OMB instance or host Composio key is imported.

`connector-setup` runs under native process-compose on a private Unix socket keyed by the project HTTP port, with only project credentials, native ports and the SOPS age context. Its health is checked by process-compose and doctor. Core tool pins remain unchanged.

A key verifies configuration, not external account authorization or a successful bot tool call. Native toolkit/auth-config requirements and account grants remain OMB/Composio responsibilities. The manual encrypted-secret mapping remains supported for headless projects; custom MCP servers do not require Composio.

## Withdrawn CLI experiment

The experimental browser/CLI setup was removed on 2026-11-09 by user request. Only the manual project-key setup form is supported. CLI routes, runtime glue, locales and the dependency were removed; native app OAuth is unchanged. The [historical trial](adr/spikes/composio-cli.md) records why this approach was withdrawn.

## Verification and upstream references

The implementation is checked against installed OpenMausBot **0.1.141**, including
`server/routes/mcp-servers.js`, `shared/tool-scope.js`, `server/config.js` and the
native team CLI. Current upstream documentation may describe newer behavior:

- [Custom MCP setup](https://github.com/milind-soni/OpenMausBot/blob/main/docs/custom-mcp-servers.md)
- [Connected apps and self-hosted setup](https://docs.openmausbot.com/docs/connected-apps)

See [panel evidence](../artifacts/delivery-evidence/connectors-panel/README.md) for
current validation, and [initial groundwork](../artifacts/delivery-evidence/connectors/README.md)
for the original native CRUD/restore checks. Real external account authorization
remains separate from the tested local OAuth provider.


## Connectors inside bot configuration

The Bots list displays each bot's known MCP selection and a **Connectors** action.
Declared bots open their existing editor directly at `#bot-connectors` through
`#/bots/<index>?section=connectors`. Native-only bots open the exact-ID native
preview/apply picker through `#/connectors?bot=<id>`; ambiguous names are not linked
by guesswork.

The editor shows **Connected applications** first, using the same native Composio
account inventory as the catalog. Saved connections remain visible even if authorization
is incomplete or failed. Refresh is independent of the MCP inventory and returning
from another tab refreshes the applications. Account authorization is distinct from per-bot permissions. Each application has an
access selector and its own review/apply flow in this section. Application grants
are not changed by MCP switches or by saving the bot form. The native-only bot picker shows this same section.

The separate **MCP servers** section lists native servers, project declarations and the direct hosted
presets. Unconnected presets are explicitly pending and cannot be enabled for a
bot until their account is authorized. Disabled native servers, unavailable
inventory and native per-bot exclusions are not presented as working tools.

A connector change updates only the edited bot's native `tools` node in the
existing team-file draft. The existing Save → Review and apply workflow remains
the mutation boundary. Partial selections and other servers are preserved until
explicitly changed. The running bot remains unchanged before Apply. The alternate
live picker is blocked while a team-file draft exists, avoiding two conflicting
permission edits.

The form explains native source settings for the default Claude engine, and
explicitly distinguishes the default Codex engine. Personal engine MCP servers
are not enumerated or copied by this project inventory. Claude's global source
switches do not apply to a bot running Codex.


## Native sources without Composio (D43)

The initial panel exposed only the Composio catalog and manual MCP creation. OMB
0.1.141 also ships direct hosted MCP cards for **Whop** and **Agentcard**, and two
independent Claude Code source switches. These now appear above optional Composio.

The hosted presets come from the installed OMB `PluginsPanel`: Whop uses
`https://mcp.whop.com/mcp`, Agentcard uses `https://mcp.agentcard.sh/mcp`. Connect
reuses an existing native entry at the same endpoint, or adds one and starts OMB's
existing OAuth flow. It does not require a Composio project. Native permissions,
provider approvals and tool selection remain applicable. External provider
acceptance is separate from the local OAuth fixture proof.

| Native switch | Effect |
|---|---|
| `features.claudeUserMcp` | Claude bots may also load this computer's Claude Code MCP servers and connectors |
| `features.claudeUserSkills` | Claude bots load skills in `~/.claude/skills`, including scripts/references, without adding MCP, hooks or personal `CLAUDE.md` through this switch |

The latter uses OMB's native skill-folder link, so edits to the original skills
arrive directly. These are instance-wide Claude options, not a separate bot
registry. Actual availability still depends on the engine and native tool policy.
The broad `OMB_CLAUDE_INHERIT_USER_CONFIG` environment escape hatch is not used.

`fyso-connector-preferences` accepts `OP=read|save` and `SETTINGS_B64`, which encodes
only one or both supported boolean fields. It calls native `/api/config`, projects
only those booleans, preserves unrelated native features and commits only
`project/omb-connectors.json`. The file uses OMB's native config patch format:

```json
{"features":{"claudeUserMcp":false,"claudeUserSkills":false}}
```

`up` restores a saved patch through the same native API, including when the stack
is already running. With no patch file, startup does nothing. Uncommitted edits to
that project file block panel saves. Native-save failure is reported; there is no
implicit rollback or claim that a partially saved configuration was versioned.

No personal Claude config, connector credentials, skills or hooks are read or
copied by the framework workflow. Enabling a switch is an explicit native runtime
choice made by the person. The feature flags can travel with Git; the underlying
personal configuration remains host-owned and differs between computers. The
real test instance retains both flags off. Tests of enabling them use a fake
native API and intercepted browser writes; they do not activate personal sources.

## Account lifecycle presentation

A saved connection is not necessarily an authorized account. Cards and bot application
inventories distinguish usable, pending and authorization-required connections. Each
account row shows its native lifecycle: authorized, incomplete, expired, failed,
inactive or unverified. Only active accounts offer Disconnect; other saved records
offer Remove saved connection. Removal still targets one exact native account ID
and requires confirmation. No stored account is removed merely because it is inactive.

## Application permissions in the panel (D46)

In a bot editor, choose **No access**, **Read only** or **Read and write** for an
application. Choose **Review app permissions**, inspect the application/level list
and choose **Apply app permissions**. Until Apply, native permissions are unchanged.
Application permissions are saved separately from the bot form. A new bot must be
saved and applied first; the native-only bot picker has the same application editor.
Account authorization remains available in the panel catalog, with only provider
consent opening an external page. No OpenMausBot settings page is needed.

`fyso-app-access` handles read/plan/apply for an exact native bot ID. It only patches
`composio`, `connectorScopes` and `connectorTools` through the native OMB bot API.
The strict native team CLI does not accept these fields, so they cannot be added to
`team.yaml`. The workflow preserves unrelated app scopes and existing partial tool
grants. Re-enabling an app missing from an existing tool allowlist adds its native
`{tools: "*"}` grant; existing per-tool lists are not broadened. Enabling the first
app on a bot whose Composio access is disabled enables only the selected apps.

When an unrestricted bot is first edited, its known existing access is materialized
as an explicit native app list. Newly connected applications outside that list
require a grant. This is explained in the editor. Unconnected apps cannot receive
new access; removing an existing app scope does not delete its account or tokens.

Plans include the target identity, permission state, native account availability and
saved-file revision. Apply rejects changed bot/account/file state, patches one exact
ID, rereads native permissions and only then versions the patch in Git. Existing
uncommitted edits to that exact permission file block preview/apply. Native or Git
failures never report success; refresh reads the actual current state before retry.

Each `project/bots/app-access/<identity-hash>.json` contains native `name`/`section`
identity plus the three native patch fields. There are no credentials or account IDs.
Restore resolves an exact unique name and section, permitting new native IDs on a
fresh data directory. Missing bots are skipped; ambiguous identities fail. `restore`
and `up` replay the saved patches and verify the native result. Renamed bots require
an intentional new grant file; old files do not match another name automatically.

The editor uses independent application inventory and permission reads, generic
localized failures and request-generation guards when changing bot or leaving the
screen. Existing MCP selection, engine source switches and native tool approvals
remain independent. A granted scope does not prove a successful external tool call.

## Connector artwork

The panel uses the optional native catalog `logo` field, which OMB obtains from
Composio toolkit metadata. The same artwork appears in catalog cards and bot app
permissions. Only HTTPS URLs without embedded credentials are rendered, using lazy
loading and no referrer. Missing or failed artwork falls back to service initials.
No separate logo registry, provider credentials or new backend endpoint is needed.

## Recommended discovery and compact cards

The catalog initially shows a curated set of common work apps: Gmail, GitHub,
Slack, Google Calendar, Google Drive, Google Sheets, Notion, Jira, Outlook and
Microsoft Teams. This is a product shortlist, not an external usage ranking.
Whop and Agentcard are excluded. Saved account connections outside the shortlist
remain visible, including incomplete authorizations. **All apps** opens the full
native catalog; typing a search also searches beyond the shortlist.

Application cards prioritize the provider logo, name, state and one action.
Account lifecycle/removal controls are under each card's account disclosure.
Native direct presets and Claude source switches remain available under Advanced
options. Bot permissions use compact icon cards; explanatory text and optional
Whop/Agentcard MCP controls are also disclosed under advanced options. No account,
permission or server is removed merely because its UI is collapsed or filtered.

## Current-main web session integration

Human access uses the existing Tinyauth session and panel ACL. Caddy strips incoming
identity/Authorization headers, validates the session, removes its cookie before
forwarding and injects the technical credential for the private setup adapter.
The adapter uses a Unix socket with mode 0600, so native web auth retains base+9
and the ten-port block does not grow. Existing Basic-login preview captures are
historical UX evidence; native gateway session tests cover the integrated boundary.
