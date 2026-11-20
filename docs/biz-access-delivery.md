# Biz-managed project access

## Outcome and delivery level

Testable beta. An organization administrator assigns project access in Fyso Biz.
In a generated project with the Biz extension enabled, each signed-in user's
effective permissions govern application entry, panel pages and server-side actions.
The framework hosts a generic authorization extension point. Biz owns assignments,
and the extension resolves policy for the bound project and verified Biz subject.
Deployment and publication are outside this beta.

## First integration check

Trace two identities with different permissions through the generated project's
real gateway. The current extension OAuth grant is project-wide. Biz's existing
`perfil` userinfo endpoint identifies the person who granted that token, so replaying
the installation grant for every browser session would assign that person's
identity to every operator. Verify per-user identity and project binding before
connecting any policy to the gateway.

Dagu and OpenMausBot currently receive shared technical credentials on their
native hosts. Establish whether the pinned versions can enforce the intended
action permissions with the real native clients before promising granular native
access. Inventory native and panel routes, including persistent connections and
remote MCP, in the same experiment. Biz is authoritative for native application
access as well. When a native application cannot enforce the assigned limits,
deny its direct interface and expose only server-authorized actions in the panel.

## Acceptance

- Biz administrators can change an assignment for one project, and neither another
  project nor another organization can use it.
- A denied user cannot load restricted application or extension content or execute
  restricted actions directly. An allowed user can perform the same operations
  through the normal UI.
- A removed assignment, missing identity or unavailable policy service cannot grant
  access. Validate permission changes against open sessions and persistent channels.
- The generated project without the extension retains its native access behavior.
- The real generated stack passes the access matrix and `mise run doctor`.

## Checkpoint

Framework branch `feat/unified-identity`, baseline `ef372ab`. The Biz extension and
Biz service were inspected in their owner checkouts. Static inspection confirmed
the project-wide grant and native shared credentials. The authenticated gateway
experiment is pending.

The first framework change adds the browser authorization import to
`fyso_login`. Caddy 2.11.9 adapted the template with the slot empty and with a
fixture directive after Tinyauth on the panel, Dagu and OpenMausBot hosts.
This is configuration evidence. The policy provider, individual Biz identity,
and separate remote MCP authorization are still pending. Run `mise run doctor`
from a generated project during the integration check.

Gateway regression rerun: 39 tests passed with real Caddy 2.11.9 and
Tinyauth 5.2.0 over loopback. The fixture verifies that the browser's identity
and Authorization headers cannot override the authenticated principal, and
that the policy receives neither the login cookie nor an application's
technical credential. Tinyauth authenticates two fixture users. The decision
service in this test is a fixture, independent of Biz.

Biz's existing `perfil` OAuth scope supplies the verified, stable platform
subject through `/oauth/userinfo`. Its organization field is informational.
Use the subject for human identity binding. Resolve organization membership
and project permissions in Biz on the decision path. Keep the installation's
agent grant independent of that binding.

Biz implementation started on `feat/framework-project-access` from
`506ed852`. The domain resolver reads the current assignment using the
organization, project, and authenticated subject, then checks the requested
capability by exact match. Four focused Vitest tests passed. The repository
adapter, administration UI, and authenticated decision endpoint are pending.

The Biz branch now includes a PostgreSQL migration for projects, levels and
assignments, and a read adapter protected by organization RLS and an active
membership check. Five focused tests passed, including the migration and
decision query under an unprivileged PGlite role. The composition root still
needs to supply the authoritative Biz membership check.

The Biz HTTP decision handler now defines `GET /oauth/framework-access` with
organization, project, and capability as inputs. It takes the subject from
validated OAuth profile props, returns an uncached decision, and distinguishes
an unavailable provider from an explicit denial. It still needs to be mounted
behind the OAuth provider and composed with the authoritative membership source.

The Biz storage adapter now supports project creation, level creation and edits,
and assignment upserts and revocation. The PGlite integration test runs those
operations under RLS, verifies that a foreign organization cannot assign a
level from another project, and reads the edited permissions through the
decision adapter. Eight focused tests pass. The admin API and UI are pending.

The Biz admin API at `/api/framework-access` now connects the current
organization's admin session to project, level, and assignment persistence.
Route tests cover member denial, cross-origin writes, and ignoring a
caller-supplied organization. Eleven focused tests pass across the Biz
domain, HTTP handlers, and persistence. UI and the live OAuth decision route
are pending.

The extension branch `feat/framework-project-access`, based on `0a37a0f`,
now has a server-side client for Biz profile and authorization lookups. It
takes the profile token explicitly, fixes the decision target to the
installation's configured organization and project, and rejects redirects
and malformed decisions. Three focused Node tests pass. Its browser OAuth
session flow and gateway integration are pending.

The extension's OAuth client now has a separate PKCE profile flow, registration,
and token exchange. Its callback cannot overwrite the installation's MCP
grant, and the profile exchange returns only an expiring access token to the
session caller. Eleven focused extension tests pass. The browser routes and
session binding are pending.

The extension socket now serves the panel profile login, callback, status, and
logout routes. The callback consumes one-time state bound to the gateway
principal and browser. The panel gets a host-only opaque cookie and the
profile token remains in the extension process. Thirteen focused extension
tests pass. Browser-visible sign-in controls, native host authorization, and
gateway enforcement remain pending.

The extension now supplies the Caddy authorization directive and private
decision handler. The initial route map checks panel entry and an exact route
capability for configuration reads, extension page assets and bot roster
reads. Unmapped requests are denied in policy mode. The native hosts are
currently denied in that mode pending an enforceable native authorization
path. Sixteen extension unit tests pass, and Caddy 2.11.9 adapts the real
directive. The generated gateway request path and MCP policy remain pending.

A real gateway check found that OAuth redirects need a browser navigation
route outside the cross-site API guard. The framework now routes the exact
extension OAuth callback to its private socket after web authentication.
The suite verifies the original method, host, and path at policy evaluation
and the OAuth return with an authenticated session. All 41 Caddy/Tinyauth
tests and the five affected extension tests passed. The decision back end in
these tests is a fixture.

The extension now renders a same-origin sign-in form in Spanish or English
and redirects panel entry there when an enabled installation has no profile
session. Copier exposes validated organization and project answers for this
mode. Seventeen focused extension tests pass. The user journey through a
real browser and Biz service still needs verification.

Biz now links from Users to an admin-only Project access screen for registering
projects, creating and editing levels, and assigning and revoking them. The
screen uses the admin API and Spanish and English catalogs. Assignments
currently take a Biz account subject manually. Connecting a verified account
picker and validating the full browser flow are pending.

The current Biz identity adapter exposes active runtime membership and the
tenant user ID through its identity companies endpoint. The new access
credential module binds these checks to an organization and tenant user
issued from the authenticated Biz session. It retains the native identity
credential in its existing encrypted form for server-side membership
lookups and bounds it by the originating session expiry. The module tests
active membership, removal, replacement, expiration, and tenant mismatch.
Mounting the dedicated OAuth scope and switching the extension to it are
pending.

Biz now issues the `framework_access` scope from the authenticated organization
session and mounts the authorization endpoint behind the OAuth provider. The
decision path calls the control plane's identity companies endpoint and reads
the effective level from PostgreSQL. MCP rejects the new token type. The
extension now requests this dedicated scope and rejects a different organization.
The admin screen selects active users from the existing directory. Fifty-six
Biz tests and eighteen extension tests passed, along with app/Worker typechecks
and locale parity. Real Biz backend and generated project acceptance are pending.

Remote MCP now has a generic post-authentication extension check over the
private socket. It checks requests before tool execution and filters the
advertised tool list. A fixture verified a direct call is denied and an
unavailable socket also denies access. Sixteen remote MCP tests passed and
one optional sops/age test was skipped. The Biz extension still needs the
remote identity binding and policy implementation.

Remote MCP can authenticate a short-lived delegated credential issued from a
Biz browser session with `app:mcp`. The issuing extension receives a digest
and checks Biz's current entry and tool permissions on every call. Rotating
the credential or closing its profile session invalidates it. The
framework passed sixteen remote MCP tests and skipped one optional test.
Four targeted extension policy and profile tests passed. The endpoint for
issuing credentials still needs a panel control and real-stack acceptance.

The browser policy now protects panel entry and its core metadata, lists
separate permissions for Biz and extension actions, and maps Dagu reads,
starts/enqueues, and outputs to distinct workflow capabilities. Tests cover
a permitted workflow beside a denied workflow, protected outputs, and
method-specific extension actions. Eight affected extension tests passed.
The native-host bridge, panel visibility, and generated acceptance remain open.

Biz can return the authenticated user's effective permissions in one read.
The extension exposes this report over the private gateway, and the panel
checks it before opening protected screens or showing their navigation
entries. The panel refreshes on focus and periodically. Its build typecheck,
ten focused Biz tests, eleven related extension tests, and both unmanaged
gateway report tests passed. Per-action visibility and real-browser
acceptance are pending.

The panel now hides shared workflow action buttons without run permission,
and managed users with MCP permission get a credential creation screen
instead of the legacy global-token controls. The extension advertises
credential creation only over HTTPS and with current MCP access. Four
targeted extension tests and the panel typecheck passed. Browser acceptance
and a complete inventory of bespoke buttons are pending.

The gateway integration now runs Caddy, Tinyauth and the actual Biz extension
process with two local accounts. An HTTP Biz fixture supplies the OAuth
and decision responses. The test links two profiles, verifies an allowed
workflow and a direct denial, reads the restricted user's permission report,
and verifies the operator's next request is denied after revocation. It
caught the authorization check inheriting the callback query string. The
extension now dispatches by pathname so callback state reaches its own handler.

Copier 9.19.1 generated a fresh project and installed the managed Biz extension
with all authorization slots. An older framework without the access API
marker rejected managed installation. The isolated generated project started
on port block 48860. The first extension connect hook returned an error after
provisioning the bot. Rerunning against the same live project found Biz Partner
and succeeded. Doctor passed and a real gateway login reached Biz sign-in
while direct app and workflow access remained denied without a Biz profile.
The fixture has no authenticated Biz grant. Real Biz authorization remains
pending. The isolated processes are available for the next integration check.

The cross-repository integration can run with the actual Biz OAuth provider
and decision Worker backed by PGlite, plus real Caddy, Tinyauth and the
rendered managed extension. The gateway tests run through the real code
exchange and profile lookup. The fixture supplies the consent identity and
native membership responses. The combined run passed, including revocation
and isolation at the Biz decision layer and direct workflow denial at the
gateway. Production login and a fully deployed Biz environment are outside
this evidence.

To rerun, set `FYSO_TEST_FRAMEWORK_GATEWAY` to this repository's
`tests/test_web_auth_http.py`, point `FYSO_TEST_BIZ_EXTENSION` at a generated
project with the managed extension installed, and set explicit Caddy and
Tinyauth binaries. Run `worker/oauth-perfil.test.ts` in the Biz checkout.

With `FYSO_TEST_DAGU` set to the pinned server binary, the combined test also
starts Dagu on the fixture's own ports and executes a real workflow. The
operator's authorized execution reached `succeeded`. The reader could neither
start that workflow nor read the operator's run, and revocation immediately
blocked another start. The control-plane identity and consent are still
fixture-managed.
