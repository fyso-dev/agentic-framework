# Phase 0 spike: tooling

Observed on **2026-11-06 UTC** (2026-11-05 in Argentina), macOS **arm64**, branch `spike/tooling`. Verification only; no template or product code changed. Phase 0 remains open for the other spikes.

## 1. Exact mise pins

### Answer

All ten tools have exact-version backend specifications. The checked-in [mise.toml](../../../spikes/tooling/mise.toml) is the tested **sandbox fallback**, not a production-ready supply-chain policy. Default mise verification failed for four tools; see below. Linux x64 is an asset-availability finding, **not a Linux installation/runtime test**.

| Tool | Explicit backend | Version string | Mac `mise install` | Linux x64 published artifact |
|---|---|---|---|---|
| Dagu | `aqua:dagucloud/dagu` | `2.25.8` | Pass, defaults | `dagu_2.25.8_linux_amd64.tar.gz` |
| process-compose | `aqua:F1bonacc1/process-compose` | `1.124.0` | Pass, defaults | `process-compose_linux_amd64.tar.gz` |
| OpenMausBot | `npm:openmausbot` | `0.1.142` | Pass, native-npm fallback (273s) | npm `openmausbot-0.1.142.tgz`; no OS/CPU restriction, Node `>=24` |
| Caddy | `aqua:caddyserver/caddy` | `2.11.9` | Pass, defaults | `caddy_2.11.9_linux_amd64.tar.gz` |
| SOPS | `aqua:getsops/sops` | `3.13.3` | Pass, fallback | `sops-v3.13.3.linux.amd64` |
| age | `aqua:FiloSottile/age` | `1.3.2` | Pass, fallback | `age-v1.3.2-linux-amd64.tar.gz` |
| fnox | `github:jdx/fnox` | `1.47.0` | Pass, defaults, warning below | `fnox-x86_64-unknown-linux-gnu.tar.gz` (musl also published) |
| gitleaks | `aqua:gitleaks/gitleaks` | `8.30.1` | Pass, defaults | `gitleaks_8.30.1_linux_x64.tar.gz` |
| Node | `core:node` | `24.15.0` | Pass, defaults | `node-v24.15.0-linux-x64.tar.gz` |
| pnpm | `aqua:pnpm/pnpm` | `12.18.0` | Pass, fallback | `pnpm-linux-x64.tar.gz` (musl also published) |

`dagu-org/dagu` redirects to `dagucloud/dagu`; use the canonical backend above. These are explicit backends rather than relying on mutable registry shorthand choices. Versions are exact releases, not ranges, `24`, or `latest`. npm transitive dependency resolution and the aqua registry remain additional reproducibility inputs; exact top-level pins alone do not freeze those.

### Evidence

Bootstrap (from the worktree root):

```sh
mkdir -p .data/bin
curl -fsSL https://github.com/jdx/mise/releases/download/v2026.11.2/mise-v2026.11.2-macos-arm64.tar.gz | tar -xz -C .data
cp .data/mise/bin/mise .data/bin/mise
source spikes/tooling/env.sh
mise --version
# 2026.11.2 macos-arm64 (2026-11-05)
mise trust spikes/tooling/mise.toml
cd spikes/tooling
mise install
```

[env.sh](../../../spikes/tooling/env.sh) puts all four `MISE_*_DIR` paths, global config, npm cache, XDG paths and fnox paths under `<wt>/.data`. It must be sourced from the worktree root. No shell profile or user configuration was changed. npm's installation prefix is mise's isolated tool directory, not a system/user global prefix.

Initial output, before fallback settings:

```text
installed 6 tools · 4 failed
age: GitHub artifact attestations verification failed ... Failed to create cache directory: Operation not permitted
sops: cosign bundle-based verification failed ... Failed to create cache directory: Operation not permitted
openmausbot: aube install failed: npm provenance ... Failed to create cache directory: Operation not permitted
pnpm: Workflow verification failed: expected 'pnpm/pnpm/.github/workflows/release.yml', found certificate identity: "https://dotcom.releases.github.com"; ... Failed to create cache directory
```

Setting XDG directories did **not** repair this on macOS. Source diagnosis: mise's [`trust.rs`](https://github.com/jdx/mise/blob/v2026.11.2/crates/mise-sigstore/src/trust.rs) constructs TUF config without a custom cache; `sigstore-trust-root 0.15.1` [`get_cache_dir`](https://docs.rs/crate/sigstore-trust-root/0.15.1/source/src/tuf.rs) uses `directories::ProjectDirs`, which selects the native macOS cache, outside the writable worktree. No attempt was made to grant writes there or repurpose `HOME`.

The explicit spike fallback is:

```toml
[settings.aqua]
cosign = false
github_attestations = false

[settings.npm]
package_manager = "npm"
```

This skips aqua Cosign and GitHub-attestation gates, and uses native npm instead of mise's default aube installer/provenance path. It **reduces verification**: checksums where supplied and npm package integrity remain, but this is not equivalent to successful attestation/provenance verification. fnox's default installation also warned that one attestation could not load a TUF root, while another verified. Do not silently ship these fallback settings in Phase 1.

The final `mise install` completed with all ten tools present (four installed with fallback, six already installed); a repeat returned exit 0 with all ten already installed. OpenMausBot package metadata reported `openmausbot 0.1.142`.

An initial attempt used quoted dotted setting names (`"aqua.cosign"`); mise warned these were unknown. The retained file uses actual nested TOML tables and was re-run.

Executable version checks:

```text
dagu version             2.25.8
process-compose version  v1.124.0 (commit f471d83)
caddy version            v2.11.9
sops --version           3.13.3
age --version            v1.3.2
fnox --version           1.47.0
gitleaks version         8.30.1
node --version           v24.15.0
pnpm --version           12.18.0
```

No OMB server or CLI auto-discovery was invoked. Its installed package metadata is used for version verification.

Release URLs, asset names, project creation dates, stars and npm metadata are preserved in [evidence.json](../../../spikes/tooling/evidence.json), captured from the [GitHub releases API](https://docs.github.com/en/rest/releases/releases#list-releases) and npm registry. Each native tool row has its exact tag/asset URL there. [Node's upstream manifest](https://nodejs.org/dist/v24.15.0/SHASUMS256.txt) lists both Darwin arm64 and Linux x64 archives. OMB is distributed through [npm](https://registry.npmjs.org/openmausbot/0.1.142), rather than a platform-specific GitHub release asset. Linux x64 native npm dependencies were also found for resvg and DuckDB; this does not establish a complete Linux runtime pass.

### Implications for PLAN.md

§1 and §10.2 are feasible at the backend/version-selection level. Phase 1 must pin mise itself, address the macOS TUF-cache integration and pnpm workflow identity mismatch, and re-run installs with the normal verification gates. Preserve the failing evidence; the fallback is a spike aid. Add a lock/digest policy separately if artifact-level reproducibility is required.

### Confidence

High for Mac execution of the listed tools and the observed verification failures. High for existence of named Linux assets; Linux behavior remains untested. OMB installation status is reported separately from any server functionality.

## 2. fnox versus SOPS + age

### Answer

Both perform an offline, repo-safe encrypted-secret round trip using a throwaway age identity, and both deliver the fake value through mise. **Recommendation: retain SOPS + age for the initial framework (D3), with fnox as the stronger future option when direct 1Password/Vault retrieval or per-task grants become a requirement.** SOPS matches today's contract with fewer integration assumptions; fnox's native mise grant integration is explicitly experimental. This recommendation does not turn the Phase 0 comparison into a new secret abstraction.

| Concern | SOPS + age | fnox age provider |
|---|---|---|
| Encrypted values in git | Structured YAML/JSON with individually encrypted values and a `sops` metadata section wrapping a data key to age recipients | TOML providers/secrets; `fnox set` writes a base64-encoded age ciphertext in `value` |
| mise integration tested | `[env] _.file = { path = "secrets.enc.yaml", redact = true }`; mise decrypts age itself | `[secrets.fnox]`, `experimental = true`, task `secrets = ["TOOLING_FAKE_SECRET"]`; secret delivered only to granted task |
| Scope | Enters environment whenever the config loads; `mise env` can reveal values despite redaction | Granted task receives env; ordinary `mise env` does not export grants; task output is redacted |
| Future 1Password | No native SOPS 1Password secret-store provider; use another existing tool/integration, or migrate to fnox | Native 1Password provider; references in TOML, values in 1Password; requires provider authentication |
| Future Vault | Native Vault **Transit** encryption/key wrapping; use SOPS CLI mode in mise for non-age keys. This is not Vault KV retrieval | Vault KV read/write provider via `vault` CLI; dynamic credentials are a separate lease feature |
| Non-expert setup | Generate key, encrypt YAML, configure one mise env file; explain key backup and recipient sharing | Generate key, add TOML provider, `fnox set`, configure task grants; easier provider migration, more profile/grant concepts |
| Maturity snapshot | SOPS repo created 2015-08-13 (~11 years), 23,628 stars, 38 GitHub release objects; current `v3.13.3` published 2026-07-23 | Repo created 2025-10-18 (~1 year), 2,360 stars, 68 release objects; current `v1.47.0` published 2026-11-03 |

Release-object counts include prereleases and reflect current API objects, not every historical tag. Stars and release counts are snapshots, not security guarantees. The age implementation is a separate dependency: repo created 2019-05-18, current `v1.3.2`, 24,213 stars in the same snapshot.

### Evidence: actual round trips

The same throwaway identity encrypted both fake values. The private key stays in gitignored `.data/keys/tooling-age.txt` (mode 0600); **only ciphertext and the public recipient are committed**.

Run from the worktree root, after installing the tools:

```sh
source spikes/tooling/env.sh
export MISE_AUTO_INSTALL=false
mkdir -p .data/keys
cd spikes/tooling
mise exec -- age-keygen -o "$TOOLING_WT/.data/keys/tooling-age.txt"
chmod 600 "$TOOLING_WT/.data/keys/tooling-age.txt"
recipient=$(mise exec -- age-keygen -y "$TOOLING_WT/.data/keys/tooling-age.txt")
```

Use a **fresh** path when repeating key generation; do not replace an identity needed to decrypt existing ciphertext. Checked-in examples retain this run's public recipient and ciphertext. For a fresh identity, regenerate both examples with the commands below. Losing the spike private key makes these historical ciphertexts undecryptable; this is intentional.

SOPS:

```sh
printf 'TOOLING_FAKE_SECRET: tooling-roundtrip-fake-only\n' > "$TOOLING_WT/.data/fake-secret.yaml"
mise exec -- sops encrypt --age "$recipient" --input-type yaml --output-type yaml \
  "$TOOLING_WT/.data/fake-secret.yaml" > sops/secrets.enc.yaml
mise trust sops/mise.toml
cd sops
MISE_SOPS_AGE_KEY_FILE="$TOOLING_WT/.data/keys/tooling-age.txt" \
  mise exec -- sh -c 'printf "sops env: %s\n" "$TOOLING_FAKE_SECRET"; test "$TOOLING_FAKE_SECRET" = tooling-roundtrip-fake-only'
# sops env: tooling-roundtrip-fake-only
# exit 0
```

The retained [SOPS mise file](../../../spikes/tooling/sops/mise.toml) points to the encrypted [secrets.enc.yaml](../../../spikes/tooling/sops/secrets.enc.yaml). mise uses its built-in age decryption; SOPS CLI is required for encryption/editing. Both `.env.yaml` and the PLAN filename `secrets.enc.yaml` were tested successfully with the same mise directive; the retained example uses `secrets.enc.yaml`.

fnox (back in `spikes/tooling`):

```sh
printf '[providers.age]\ntype = "age"\nrecipients = ["%s"]\n' "$recipient" > fnox/fnox.toml
export FNOX_AGE_KEY_FILE="$TOOLING_WT/.data/keys/tooling-age.txt"
mise exec -- fnox --config ./fnox/fnox.toml set TOOLING_FAKE_SECRET tooling-roundtrip-fake-only --provider age
mise trust fnox/mise.toml
cd fnox
mise run read-fake
# [read-fake] $ test "$TOOLING_FAKE_SECRET" = [redacted] ...
# fnox env round trip: PASS
mise exec -- fnox get TOOLING_FAKE_SECRET
# tooling-roundtrip-fake-only
```

The retained [fnox.toml](../../../spikes/tooling/fnox/fnox.toml) contains ciphertext; [mise.toml](../../../spikes/tooling/fnox/mise.toml) grants it to `read-fake`. The task's equality assertion proves the actual env value despite log masking. fnox's daemon was explicitly disabled, and its config/state paths were isolated. Real secrets should be entered through stdin or the hidden prompt, not command arguments. Only the deliberately fake value was printed here.

An early task used shell `${#VAR}` inside a mise template and failed parsing (`Closing comment tag '#}' not found`). Replacing the length formatting with an equality assertion fixed it; the final task passed.

Sources: version-pinned [mise SOPS integration](https://github.com/jdx/mise/blob/v2026.11.2/docs/environments/secrets/sops.md), [mise fnox integration](https://github.com/jdx/mise/blob/v2026.11.2/docs/environments/secrets/fnox.md), [fnox age format/setup](https://github.com/jdx/fnox/blob/v1.47.0/docs/providers/age.md), [fnox Vault](https://github.com/jdx/fnox/blob/v1.47.0/docs/providers/vault.md), [fnox 1Password](https://github.com/jdx/fnox/blob/v1.47.0/docs/providers/1password.md), [SOPS docs](https://getsops.io/docs/). Cloud-provider authentication was not tested.

### Implications for PLAN.md

Keep D3 for Phase 1 and record this as the tooling evidence for D16/§10.8. Secrets-init should generate/locate the identity, explain recovery and recipient onboarding, encrypt fake/example inputs, and use native mise loading. Do not promise native SOPS-to-1Password retrieval. If that becomes mandatory, explicitly reconsider fnox and its mise grant API; no custom secret service is needed.

### Confidence

High for both local encryption/decryption/env round trips and the file formats. Medium for the recommendation (onboarding judgment and evolving fnox/mise API). Provider extensibility is documented/source-backed, not an authenticated 1Password/Vault test.

## 3. Dagu Git Sync: pull and publish

### Answer

**Git Sync is bidirectional.** It can pull remote files into the local DAG directory and explicitly publish local/UI edits by committing and pushing to the configured branch. UI save and Git publish are separate operations. `push_enabled` defaults to true; disabling it blocks publish. Auto-sync is not a promise of automatic publication after each UI edit.

A local bare-repo experiment successfully pulled, edited through the UI's REST API, published, and verified the exact resulting file and commit in the bare remote. **Direct cloning of an absolute local path failed**; the successful test preseeded Dagu's clone with native git. It proves the publish path against a local transport, not clean local-URL bootstrap or authenticated GitHub hosting.

### Evidence: docs and version-pinned source

Read [Dagu Git Sync docs](https://docs.dagu.sh/server-admin/git-sync) and [configuration reference](https://docs.dagu.sh/server-admin/reference). The installed release is `v2.25.8`; source checkout SHA `28022fee38b59c1474491fecf571791fbde8e9e7`.

- [`ui/src/pages/git-sync/index.tsx`, `handlePublish`](https://github.com/dagucloud/dagu/blob/v2.25.8/ui/src/pages/git-sync/index.tsx#L366) calls `POST /sync/items/{itemId}/publish` or `/sync/publish-all`, with a commit message.
- [`api/v1/api.yaml`](https://github.com/dagucloud/dagu/blob/v2.25.8/api/v1/api.yaml#L8184) and [`frontend/api/v1/sync.go`, `PublishSyncItem`](https://github.com/dagucloud/dagu/blob/v2.25.8/internal/service/frontend/api/v1/sync.go#L390) expose/call the publish service.
- [`gitsync/service.go`, `Publish`](https://github.com/dagucloud/dagu/blob/v2.25.8/internal/gitsync/service.go#L1087) validates push permission and item state, copies local bytes into the Git clone, then calls `commitAndPush`.
- [`gitsync/git.go`, `commitAndPush`/`Push`](https://github.com/dagucloud/dagu/blob/v2.25.8/internal/gitsync/git.go#L515) stages, commits and uses go-git's `PushContext`. It rolls back its clone mutation on failure.
- [`config/loader.go`](https://github.com/dagucloud/dagu/blob/v2.25.8/internal/cmn/config/loader.go#L1852) defaults push on and binds the `DAGU_GITSYNC_*` variables. [`internal/cmd/sync.go`](https://github.com/dagucloud/dagu/blob/v2.25.8/internal/cmd/sync.go) provides `dagu sync pull`, `status`, and `publish` without requiring a running server.

Local experiment, from `<wt>`:

```sh
source spikes/tooling/env.sh
source spikes/tooling/dagu-env.sh
export MISE_AUTO_INSTALL=false
mkdir -p .data/tooling-seed "$DAGU_HOME"
git init --bare --initial-branch=main .data/tooling-remote.git
git -C .data/tooling-seed init --initial-branch=main
printf 'steps:\n  - name: hello\n    command: echo tooling-seed\n' > .data/tooling-seed/hello.yaml
git -C .data/tooling-seed add hello.yaml
git -C .data/tooling-seed -c user.name='Tooling Spike' -c user.email='spike@example.invalid' commit -m 'Seed local Git Sync test'
git -C .data/tooling-seed remote add origin "$DAGU_GITSYNC_REPOSITORY"
git -C .data/tooling-seed push origin main
cd spikes/tooling
mise exec -- dagu sync pull
# Error: failed to pull: network error during clone:
# Get "https:///<wt>/.data/tooling-remote.git.git/info/refs?...": http: no Host in request URL
```

This is explained by [`normalizeRepoURL`/`isFullURL`](https://github.com/dagucloud/dagu/blob/v2.25.8/internal/gitsync/git.go#L107): only HTTP(S), `git@` and `ssh://` are recognized; other strings become `https://<input>.git`. `file://` is also not recognized in this version. To test the service without changing upstream code, preseed its clone:

```sh
# Back at <wt>:
mkdir -p "$DAGU_HOME/data/gitsync"
git clone "$DAGU_GITSYNC_REPOSITORY" "$DAGU_HOME/data/gitsync/repo"
cd spikes/tooling
mise exec -- dagu sync pull
# Pull completed successfully
#   Synced: 1 sync items
```

For the isolated API experiment, `.data/dagu/config.yaml` contained:

```yaml
auth:
  mode: none
skip_examples: true
```

[dagu-env.sh](../../../spikes/tooling/dagu-env.sh) fixes `DAGU_HOME` and DAGs under `.data/dagu`, binds loopback, sets all five required ports to 8420–8424, enables Git Sync/push and disables automatic sync/startup pull. It uses a fake token required by Dagu's token-auth configuration even though the local transport needs no credentials.

```sh
# Environment still sourced; cwd spikes/tooling
python3 dagu-api-probe.py
```

[dagu-api-probe.py](../../../spikes/tooling/dagu-api-probe.py) checks its paths/ports, confirms 8420 is available, starts only `dagu server`, and terminates/waits for that process in `finally`. It uses optimistic `expectedSha256` when editing. Trimmed actual output:

```text
GET /dags/hello/spec 200
PUT /dags/hello/spec 200 {"errors":null,"sha256":"e88c9ee25570e18cdd24e6fb0ec60ae98d93a76abb40cde8696be63351eeeaf2"}
GET /sync/status 200 ... "modified":1 ...
POST /sync/items/hello/publish 200 {"message":"Published hello","success":true,"synced":["hello"]}
Bare remote content equals UI API edit: PASS
e8c42e6 Dagu <dagu@localhost> Publish tooling UI API edit
Probe-owned Dagu stopped: 0
```

The remote `main:hello.yaml` was exactly:

```yaml
steps:
  - name: hello
    command: echo tooling-ui-api-edit
```

This exercises the UI's API endpoints; no browser click-through was performed. Existing first-run example DAGs remained untracked and were not published. No command contacted the user's Dagu/OMB ports. No OMB process was started; the one probe-owned Dagu server exited cleanly.

### Implications for PLAN.md

§10.9 is answered: use native publish where workflow/UI edits need a commit+push, rather than inventing a workflow Git transport. §6/Phase 3 still needs a broader snapshot for bot configuration and memory: Git Sync's managed files are not proof of a full project/config/memory backup. Do not run an independent snapshot writer against Dagu's private clone. Choose one owner per tracked file/branch and define pull-conflict/publish-failure handling. Keep the local-path bootstrap limitation in the test strategy; hosted-repo auth is a separate check.

### Confidence

High for bidirectional Git Sync, the UI-to-service source path, and tested REST edit/publish to a local bare remote. High for the local-path normalization failure in this release. Unverified: browser clicks, SSH/HTTPS credentials, network failures, multi-writer conflict recovery and complete project snapshots.
