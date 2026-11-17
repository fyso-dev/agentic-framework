# Installer app — D35, D38

The current macOS prototype provides an end-user installer: a disk image with **Fyso.app** to drag to Applications. Since D85 the app is the menu bar app and `fyso` CLI ([below](#menu-bar-app-and-cli--d83)); its *Create instance* action runs the installer described here, which shows a friendly window that lists each dependency with its state (waiting, installing, done, failed) and ends with "Abrir panel". The selected Linux direction and proposed Windows architecture are documented below; neither has completed acceptance testing.

## Pieces (reused, not built)

| Piece | What | Pin |
|---|---|---|
| Window | **[swiftDialog](https://github.com/swiftDialog/swiftDialog)** (MIT, notarized by its author), bundled inside the app: no `.pkg`, no admin password. The installer drives it through its command file (`listitem`, `progress`, `message`, `button1text`) | 3.1.1 (`build.sh`, sha256-checked); **needs macOS 15+** |
| mise | `mise generate install-script`: downloads a pinned mise, sha256-checked, into `~/.local/bin/mise` (skipped when mise is already on `PATH`) | 2026.11.2 |
| Engine | **Dagu CLI** (`dagu start --dagu-home …`): runs the installation workflow with no server, no ports and no UI | 2.24.0 |
| Steps | `Resources/fyso-install.yaml`, **generated at build time** from `template/mise.toml.jinja`: one step per pinned tool, all started at once (npm tools after Node), plus generate (Copier 9.19.1 via `uvx`), trust, web login (`web_auth`), setup, git, start ([D87](#timings--d87)) | template pins |
| Web login | **Tinyauth**, unmodified, built by `build-tinyauth.sh` (called from `build.sh`) from the pinned source tag (`FYSO_TINYAUTH_VERSION`, archive checked against `FYSO_TINYAUTH_SHA256`) for arm64 and x86_64 with the upstream release flags, joined with `lipo`: `Contents/Helpers/tinyauth`. Its AGPL-3.0 `LICENSE`, source URL/tag and checksums are in `Resources/third-party/tinyauth/`. Upstream publishes Linux binaries only | template pin (5.2.0) |
| GitHub login | Only when plain `git ls-remote` cannot read the source (a private repository): `gh auth login --web` (device code shown in the window) + `gh auth setup-git`. A public source shows "not needed" and never installs GitHub CLI | GitHub CLI 2.95.0 |

The installer is a bash script (`fyso-installer.sh`, macOS bash 3.2) bundled as `Fyso.app/Contents/Resources/fyso-installer.sh`, with swiftDialog in `Contents/Helpers` as sealed nested code; the app's executable is the native `fyso` binary (D85), so no separate launcher is needed. `build.sh` assembles the app and the `.dmg` with `hdiutil`; `sign.sh` signs, notarizes and staples both (below).

## Flow

1. **Form** (swiftDialog, styled like the panel's dark theme: its top bar as banner, `#0e0e12` background): project name, panel **user** (default `admin`) and the person's **own password** (typed twice, never prefilled), coding engine, and **port** (prefilled with the first free block, editable, validated). The folder shows as text with a **Cambiar carpeta…** button that opens macOS's own folder picker (it has New Folder); a typed folder that does not exist is created.
   - Fields use swiftDialog's per-field JSON form and `--json` output, read with macOS's `plutil`. Its comma form reads every token as a possible keyword: `name=name` made the project field's key `,value=`, so the typed name was dropped and every project was called *Mi proyecto*; a typed comma or `=` also broke the field.
   - **Password policy** (moderate, no symbol rules): 12–72 bytes (what the login service's bcrypt accepts), at least 5 different characters, not only digits, not a keyboard/alphabet sequence (alone or with up to 4 extra characters, `qwertyuiop12`), not a common password even with digits for letters or digits and symbols around it (`P@ssw0rd2026`, `adminadmin123`), and not containing the user or project name. A refused password reopens the form with the reason; in an unattended run a `FYSO_PASSWORD` that fails the policy stops the installer before anything is installed (without one, `setup` generates a readable password, [web-auth.md](web-auth.md)). The value is never passed as a process argument nor given a swiftDialog regex (swiftDialog logs values that fail one).
   - **Ports never collide** with another Fyso project, running or stopped: the installer skips blocks in its registry (`~/Library/Application Support/Fyso/projects.tsv`, one line per installed project, entries whose folder is gone are ignored), the `port_base` of Fyso projects next to the chosen folder, running stacks' sockets, and any listening port.
   - **The password** goes to a private file (mode 600) that the template's `setup` reads through `FYSO_INITIAL_PASSWORD_FILE`; it is never a Dagu parameter (those are stored with the run) and the file is removed when the installer exits.
2. **Window** with every item and the current step in words under the progress bar (*Descargando Caddy…*, *Creando proyecto…*, *Iniciando agentes y servicios…*; swiftDialog's `progresstext`), then: Apple Command Line Tools (`xcode-select --install` when missing, waits for Apple's installer), mise, Dagu, GitHub account.
3. **Workflow**: the script starts `dagu start` and maps each step's state from the run's `status.jsonl` (4 ok, 1 running, 2 failed, 3 not run) to the window. Parameters reach steps as environment variables.
4. **Engine session**: checks `claude auth status` / `codex login status`; a missing session is shown as pending, not as a failure.
5. **Done** shows the panel URL and the login that really works (checked against the panel). **Continuar** leads to **Conecta tu asistente**: the agents found on the Mac as checkboxes (Claude Desktop and Codex checked, Claude Code CLI as an option), applied with the project's `mise run agent:connect` (D36); then a last screen offers **Abrir Codex** (or **Abrir Claude**; both when both were connected) through `mise run agent:open`, or **Abrir panel**. A failure names the step in plain words and opens the log (`~/Library/Application Support/Fyso/installer/installer.log`) when the window closes.

The project's own stack keeps running after the installer's Dagu exits (verified).

## Build and test

```sh
installer/macos/build.sh             # → installer/macos/dist/Fyso.app and Fyso.dmg (unsigned)
EDITION=biz installer/macos/build.sh # → Fyso Biz.app and Fyso-Biz.dmg
SIGN_IDENTITY="Developer ID Application: <name> (<TEAMID>)" NOTARY_PROFILE=fyso-notary installer/macos/build.sh   # signed, notarized, stapled
```

### Signing and notarization

A downloaded copy opens without warnings only when the app is signed with a **Developer ID Application** certificate, notarized by Apple and stapled. `build.sh` does all of it when `SIGN_IDENTITY` is set, through `installer/macos/sign.sh`:

1. `codesign --options runtime --timestamp` on every nested Mach-O outside `Contents/MacOS` (a bundled tool binary in `Resources` or `Helpers`), then on the app (hardened runtime, carried by the `fyso` Mach-O). swiftDialog's own signature (team `PWA5E9TQ59`) is checked and sealed as a helper, never re-signed: no `--deep`.
2. The app is zipped and submitted with `notarytool submit --wait`; on rejection the service log is printed. The ticket is stapled to the app before the dmg is built, so the app inside the image carries it.
3. The dmg is signed, notarized and stapled on its own; `spctl --assess` confirms both verdicts.

One-time setup on the build Mac:

- A **Developer ID Application** certificate from the Apple Developer Program account of the organisation (only the Account Holder can create it: Certificates, Identifiers & Profiles → Certificates → `+` → Developer ID Application, uploading a CSR made on the build Mac). Import the downloaded `.cer` next to its private key in the login keychain; `security find-identity -v -p codesigning` must then list it. Its name is the `SIGN_IDENTITY` value.
- Notarization credentials saved once as a keychain profile, either an App Store Connect API key (Users and Access → Integrations → App Store Connect API, role Developer): `xcrun notarytool store-credentials fyso-notary --key AuthKey_<id>.p8 --key-id <id> --issuer <issuer>`, or an Apple ID with an app-specific password: `xcrun notarytool store-credentials fyso-notary --apple-id <id> --team-id <TEAMID> --password <app-specific>`. The profile name is `NOTARY_PROFILE`.

`SIGN_IDENTITY=-` signs ad hoc (no timestamp, no notarization) and is enough to check the bundle layout locally; Gatekeeper still blocks such a copy when downloaded. Xcode is not needed: the Command Line Tools provide `swiftc`, `codesign`, `notarytool` and `stapler`.

Unattended run for tests (no form; the window closes by itself): `FYSO_AUTO=1 FYSO_NAME=… FYSO_FOLDER=… [FYSO_PORT=… FYSO_SOURCE=… FYSO_REF=… FYSO_HOME=…] "dist/Fyso.app/Contents/MacOS/fyso" create`. `FYSO_HOME` moves the registry and installer data out of `~/Library/Application Support/Fyso`.

Verified 2026-11-06 on macOS (arm64): from `gh:fyso-dev/agentic-framework@main`, all 15 steps succeeded, the stack answered (panel 200, Dagu/OMB/Caddy ready) and the initial commit used the person's git identity; with an unreachable template, the window marked "Proyecto" failed, its dependants "no se ejecutó", and the installer exited 1. Sizes: app 34 MB, dmg 21 MB (swiftDialog is most of it). Also verified: a custom user and a password with quotes log in (200) while `admin/admin` is refused (401), the password appears nowhere in the installer's Dagu data, and a second project got the next free block (8410) while the first used 8400.

Each run logs one `timing: <step> <seconds>s` line per step (Dagu's own start/finish times for workflow steps) and the total.

### Timings — D87

Measured 2026-11-16 on macOS 26 (arm64), one cold run (its logs were not kept): a fresh home folder, so mise and every tool were downloaded, as on a new Mac; template from `main`. Total **250 s** until the panel answered; the chosen user and password then logged in (200; a wrong password 401) and the password appeared in no installer or Dagu file. The same run found that copier 9.19.1 needs Python ≥ 3.10 while a new Mac only has the Command Line Tools' 3.9: the generate step now asks uv for `>=3.10`, which uses an installed one or downloads its own.

| Step | Seconds | Note |
|---|---|---|
| Apple tools, mise, Dagu, GitHub | 0 + 12 + 18 + 7 | sequential, before the workflow |
| generate (Copier) | 34 | includes uv and a Python download |
| tools, in parallel | 70 wall | longest: Go 70, sops 66, pnpm 65; npm tools (OpenMausBot, Pi) wait for Node (34) |
| setup, git | 5, 0 | |
| start | 98 | ~82 building Tinyauth from source (pnpm install + Vite + Go), ~11 processes until Caddy is ready, ~5 restore, bots and MCP |

The downloads share one connection: each tool fetched at ~450 kB/s while all ran, so sops (50 MB) and pnpm (48 MB) took as long as Go. The Tinyauth build also downloads: on a fresh home its Go modules took ~630 MB on disk and its frontend ~200 MB of npm packages.

**D87: the web login is never compiled while a project is created.** On Linux `web-auth:install` downloads the upstream release binary (SHA-256 pinned). On macOS the app bundles the universal binary described above; the installer passes it to the `web_auth` step, which copies it into the per-user cache `${XDG_CACHE_HOME:-~/.cache}/fyso/web-auth/<version>-<source sha256>-darwin/` only when the bundle's version, source checksum and binary checksum all match the project's pins, and every project copies it from there after checking it again. A project without the bundle (made by hand, or a bundle that does not match) builds the pinned source once per machine into the same cache, installing the pinned Go and pnpm on demand; Go and pnpm are no longer project tools. The workflow also changed: every non-npm tool starts at once instead of after the project is generated, npm tools only wait for Node, `setup` waits only for age, sops, Node, YAML and Caddy, and steps run with mise's automatic installs off. After signing, `build-tinyauth.sh --record <app>` must rewrite the binary's checksum (codesign changes the file), or the installer falls back to building.

Before and after on this Mac (macOS 26, arm64), unattended through the generated workflow with a fresh home folder (no mise, tools, Go or npm caches), the template from this branch, the project's own port block; "second" is another project in the same home folder. Seconds of the workflow (from *generate* to the panel answering); downloads vary between runs on the same connection (an earlier after-run took 114 s, another 165 s while the generate step's downloads were slow), so each row is one run:

| Run | Workflow | generate | tools until the last one | web login | setup + git | start |
|---|---|---|---|---|---|---|
| Before, first project | 199 | 26 | 93 (pnpm, sops) | built in `start` | 6 | 97 (~80 build) |
| After, first project | **95** | 69 (uv, Python, Copier sharing the connection) | 63 (sops) | 1 (bundled copy) | 6 | 17 |
| Before, second project | 76 | 18 | 2 | built in `start` (warm caches) | 3 | 52 |
| After, second project | **32** | 16 | 1 | 1 (cached copy) | 3 | 12 |

The steps before the workflow (Apple tools, mise, Dagu) are unchanged: Dagu took 14–54 s to download in these runs. The app grows from 34 to 105 MB (dmg 21 → 49 MB), the universal Tinyauth binary being 71 MB of it.

Not deferred until the panel is open, after measuring: tools, because the services keep the `PATH` they started with and would not see a tool installed later until a restart; and the post-start work in `up` (restore, bot repair, connector and app-access restore, connect-extensions, the setup-check and observability enqueues, which already run in Dagu), because it takes ~2 s in total and the first panel view needs the restored bots.

The app icon is the logo full bleed: macOS rounds icons itself, and macOS 26 shows a pre-rounded square shrunk on a grey plate. The disk image's volume carries the logo too (`.VolumeIcon.icns` plus the root's custom-icon flag, set on a writable image because `hdiutil` does not copy it); the `.dmg` file's own icon is not set, since a downloaded file loses it.

UI copy and workflow step titles are bundled from `installer/macos/locales/{es,en}.sh`. The first macOS preferred language selects English when it starts with `en`; Spanish is the fallback. `FYSO_LANG=es|en` overrides this for verification. Repeated project names receive a unique slug and matching directory suffix, bounded to 31 characters, also checking registered projects and running project sockets.

## Open items

- **Signing and notarization.** Done (2026-11-16): `sign.sh` signs with Developer ID, notarizes and staples app and dmg; Apple accepted both and `spctl` reports *Notarized Developer ID*. Still open: a CI job that does it on GitHub (certificate and API key as secrets).
- **macOS 13–14.** swiftDialog 3.x needs macOS 15; the 2.5 line supports older systems.
- **Private template.** The GitHub step disappears if `fyso-dev/agentic-framework` becomes public.
- **Linux and Windows delivery.** Follow D38 below. The Linux Zenity experiment was exploratory and has been archived outside the checkout; it is not the selected delivery or proof that Qt installation works.


## Menu bar app and CLI — D85

One native app replaces the separate installer app and the SwiftBar plugin (D34). Decision and options: [ADR 0003](adr/0003-menu-bar-app.md).

- **`Fyso.app`** (`installer/macos/app/Fyso.swift`, compiled with `swiftc` by `build.sh`, universal, macOS 15+). Without arguments it is a SwiftUI `MenuBarExtra` (`LSUIElement`: no window, no Dock icon) that registers itself as a login item on first launch (toggle *Abrir al iniciar sesión*). With arguments it is the CLI; on launch it links `~/.local/bin/fyso` to itself.
- **Instances** are the installer's registry `projects.tsv` (`port<TAB>folder`); name, slug and panel URL come from each project. State: *en marcha* / *con problemas* / *detenida* / *no responde*, from the stack's process-compose socket. The menu bar icon is filled while the current instance runs.
- **Menu**: the current instance and its state; per instance *Abrir panel*, *Usar como actual*, *Iniciar*/*Detener* (`mise run up/down`, login-shell `PATH`, log in `.data/logs/tray.log`, notification at the end), *Abrir carpeta*, *Ver registro*; then *Crear instancia…* (the installer form above; the new instance becomes current), *Abrir al iniciar sesión*, *Salir*. First launch with no instance opens the create form.
- **Not registered**: stacks running on the Mac whose folder is not in the registry (found from their `/tmp/fyso-*.sock` owner) appear under *En marcha, sin registrar* with *Añadir a Fyso*; `fyso list` marks them `+` and prints the `fyso add` command.
- **CLI**: `fyso list [--json] | status | open | switch | start | stop [<instance>] | create | add <folder> | biz-login | biz-status | biz-logout | update [--check] | version`; an instance is named by name, slug or folder, default the current one. `fyso status` exits 0 only when the instance runs.
- **Biz edition** (`EDITION=biz`, `Fyso Biz.app`, bundle id `dev.fyso.biz`, D86): the menu starts with *Iniciar sesión en Fyso Biz*, started on first launch. The browser opens Biz's authorize page and the session comes back to the app on a one-shot `127.0.0.1` callback (OAuth dynamic registration, PKCE, RFC 8252 loopback; Biz's existing server). *Crear instancia…* signs in first when needed, runs the installer, hands the session to the new project (`.data/ext/biz/oauth.json`, the Biz extension's file) and installs the `biz` extension; the panel's Fyso Biz page is then already connected. A session goes to one instance (Biz rotates refresh tokens), so the next one asks to sign in again. `FYSO_BIZ_URL` points the app at another Biz origin (a local Biz: `http://localhost:8787`).
- **Updates** (D86): the app checks this repository's GitHub Releases at launch and daily; *Actualizar a la versión X* opens the new dmg download in the browser (Gatekeeper checks it) to drag over the old app.
- **Migration**: the template no longer ships the SwiftBar plugin; `mise run tray:install` lists a hand-made project in the registry (through `fyso add` when the CLI exists). On first launch the app imports the old plugin's remembered projects and removes SwiftBar's link to `framework/tray/fyso.10s.py` (only that link). `FYSO_TEST=1` skips these first-launch effects and the login item.

### Publishing a release (D86)

```sh
VERSION=0.2.0 SIGN_IDENTITY="Developer ID Application: <name> (<TEAMID>)" NOTARY_PROFILE=fyso-notary installer/macos/build.sh
VERSION=0.2.0 EDITION=biz SIGN_IDENTITY="…" NOTARY_PROFILE=fyso-notary installer/macos/build.sh
gh release create macos-v0.2.0 --latest=false --title "Fyso for Mac 0.2.0" installer/macos/dist/Fyso.dmg installer/macos/dist/Fyso-Biz.dmg
```

Installed apps older than `0.2.0` offer the update. The `macos-v` prefix keeps these tags out of Copier's template versions (not PEP 440) and `--latest=false` keeps the framework release as the repository's latest.

## Cross-platform installer direction — D38

**Decision:** use **Qt Installer Framework** for the Linux graphical installer, reusing
its wizard, directory selection, progress, error handling and packaging. Keep custom
code limited to configuration and small adapters to the existing Dagu workflow.
Zenity was explored but is not the selected approach: individual dialogs still require
us to implement the wizard lifecycle ourselves.

Qt Installer Framework supports Linux, Windows and macOS. That tool support does not
establish Fyso runtime compatibility. The existing swiftDialog macOS installer remains
the verified prototype; replacing it with Qt is a separate future migration.

| Platform | Installer UI | Fyso runtime | Delivery status |
|---|---|---|---|
| macOS | Existing swiftDialog app; Qt is a future unification option | Native tools managed by mise | Existing prototype verified as described above; no Qt migration verified |
| Linux | Qt Installer Framework native graphical wizard | Native Linux tools managed by mise; shared Dagu installation workflow | Implemented in `installer/qt/`; native ARM64 build and runtime routes tested; engine login and clean-host acceptance pending |
| Windows | Proposed native Qt Installer Framework `.exe` | Shared Linux installation inside WSL2, initially targeting Ubuntu | Qt package/build recipe and WSL2 adapter implemented; native executable build and Windows-host acceptance pending |

### Shared installation contract

- Qt owns the installer wizard and packaging. Dagu owns dependency installation,
  project generation, encrypted-secret setup and stack startup. Tool versions remain
  pinned; no separate installation engine or package manager is introduced.
- Reuse Copier for project generation and updates. Qt maintenance/uninstallation must
  not overwrite or recursively remove generated project configuration, state, memory,
  repositories or age keys. Define those boundaries before enabling maintenance actions.
- Preserve project isolation: a unique slug and MCP registration, free port blocks,
  project-local data directories and explicitly targeted OpenMausBot commands.
- Passwords must not enter process arguments, Dagu parameters, installer metadata or
  logs. Keep the existing private-file handoff and remove temporary secret files.
- UI copy must use ES/EN resources with Spanish as the fallback.
- A failed step must be visible and retain a usable technical log. Cancellation must
  stop installer-owned work; it must not terminate unrelated projects or erase data.
- Call installation verified only after the generated project's `mise run doctor`
  passes and the authenticated panel, Dagu and OpenMausBot routes work. Report missing
  coding-engine authentication separately; a test stub is not subscription-login proof.

### Windows flow (proposed)

1. Run a native Qt wizard and detect WSL2 and the intended Linux distribution.
2. When WSL is missing, explain the prerequisite and guide its installation using
   Microsoft's supported mechanism. Enabling it can require administrator rights and
   a restart. Resume only after confirming the Linux environment is ready.
3. Run the shared installation inside the selected distribution. Keep project files,
   tools, encrypted secrets and keys in its Linux filesystem. Coding-engine CLIs and
   logins must be available there; Windows-side installations do not prove this.
4. Verify services inside WSL and browser access from Windows. Validate hostname
   resolution and port forwarding rather than assuming `*.localhost` behaves identically
   on every host.
5. Test desktop-agent integration across the Windows/WSL boundary separately: executable
   paths and MCP launch commands differ from native Linux and macOS.

Native Windows execution of the current Bash scripts is not part of this proposal.
WSL detection, restart/resume behavior, paths containing spaces, networking, login,
repeated installations, cancellation and safe cleanup all require Windows-specific tests.

### Implementation and verification

The implementation, build commands, dependency requirements, ownership boundaries and
observed limitations are in [installer/qt/README.md](../installer/qt/README.md).
The existing macOS entry point now delegates to the shared Dagu generator. No macOS
Qt migration is included.

### Remaining verification gates

1. Qt Installer Framework is pinned to 4.7.0. Validate clean-host dependencies and
   native binaries on each delivery architecture; the Linux ARM64 test build required
   isolated compatibility libraries on Ubuntu 24.04.
2. The Linux wizard ran the real workflow and all three authenticated routes returned
   200. Doctor reports the fixture's missing Codex login. Complete acceptance with a real
   engine login; protocol and failure tests do not replace that prerequisite.
3. Build and run the Windows adapter on Windows. Test an existing WSL2 installation,
   first-time setup with UAC/restart, native browser routing and actual cancellation.
   Executing PowerShell with a fake `wsl.exe` is a protocol test only.
4. Record platform-specific evidence before changing any delivery status to verified.

### Upstream references

- [Qt Installer Framework overview](https://doc.qt.io/qtinstallerframework/ifw-overview.html):
  supported desktop platforms and built-in installation pages.
- [Qt installer creation](https://doc.qt.io/qtinstallerframework/ifw-creating-installers.html):
  native configuration and package layout.
- [Qt installer operations](https://doc.qt.io/qtinstallerframework/operations.html):
  command execution and installation/uninstallation behavior.
- [Microsoft: Install WSL](https://learn.microsoft.com/en-us/windows/wsl/install):
  prerequisites and the supported WSL setup process.
