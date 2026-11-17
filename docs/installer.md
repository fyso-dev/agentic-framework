# Installer app — D35, D38

The current macOS prototype provides an end-user installer: a disk image with **Fyso Installer.app** to drag to Applications. Opening it shows a friendly window that lists each dependency with its state (waiting, installing, done, failed) and ends with "Abrir panel". The selected Linux direction and proposed Windows architecture are documented below; neither has completed acceptance testing.

## Pieces (reused, not built)

| Piece | What | Pin |
|---|---|---|
| Window | **[swiftDialog](https://github.com/swiftDialog/swiftDialog)** (MIT, notarized by its author), bundled inside the app: no `.pkg`, no admin password. The installer drives it through its command file (`listitem`, `progress`, `message`, `button1text`) | 3.1.1 (`build.sh`, sha256-checked); **needs macOS 15+** |
| mise | `mise generate install-script`: downloads a pinned mise, sha256-checked, into `~/.local/bin/mise` (skipped when mise is already on `PATH`) | 2026.11.2 |
| Engine | **Dagu CLI** (`dagu start --dagu-home …`): runs the installation workflow with no server, no ports and no UI | 2.24.0 |
| Steps | `Resources/fyso-install.yaml`, **generated at build time** from `template/mise.toml.jinja`: one step per pinned tool (parallel; npm tools after Node), plus generate (Copier 9.19.1 via `uvx`), trust, git, setup, start | template pins |
| GitHub login | Only when plain `git ls-remote` cannot read the source (a private repository): `gh auth login --web` (device code shown in the window) + `gh auth setup-git`. A public source shows "not needed" and never installs GitHub CLI | GitHub CLI 2.95.0 |

The app itself is a folder with an `Info.plist` and a bash script (`fyso-installer.sh`, macOS bash 3.2); `build.sh` assembles it and the `.dmg` with `hdiutil`.

## Flow

1. **Form** (swiftDialog, styled like the panel's dark theme: its top bar as banner, `#0e0e12` background): project name, panel **user** and **password** (default `admin` / `admin`), coding engine, and **port** (prefilled with the first free block, editable, validated). The folder shows as text with a **Cambiar carpeta…** button that opens macOS's own folder picker (it has New Folder); a typed folder that does not exist is created.
   - **Ports never collide** with another Fyso project, running or stopped: the installer skips blocks in its registry (`~/Library/Application Support/Fyso/projects.tsv`, one line per installed project, entries whose folder is gone are ignored), the `port_base` of Fyso projects next to the chosen folder, running stacks' sockets, and any listening port.
   - **The password** goes to a private file (mode 600) that the template's `setup` reads through `FYSO_INITIAL_PASSWORD_FILE`; it is never a Dagu parameter (those are stored with the run) and the file is removed when the installer exits.
2. **Window** with every item, then: Apple Command Line Tools (`xcode-select --install` when missing, waits for Apple's installer), mise, Dagu, GitHub account.
3. **Workflow**: the script starts `dagu start` and maps each step's state from the run's `status.jsonl` (4 ok, 1 running, 2 failed, 3 not run) to the window. Parameters reach steps as environment variables.
4. **Engine session**: checks `claude auth status` / `codex login status`; a missing session is shown as pending, not as a failure.
5. **Done** shows the panel URL and the login that really works (checked against the panel). **Continuar** leads to **Conecta tu asistente**: the agents found on the Mac as checkboxes (Claude Desktop and Codex checked, Claude Code CLI as an option), applied with the project's `mise run agent:connect` (D36); then a last screen offers **Abrir Codex** (or **Abrir Claude**; both when both were connected) through `mise run agent:open`, or **Abrir panel**. A failure names the step in plain words and opens the log (`~/Library/Application Support/Fyso/installer/installer.log`) when the window closes.

The project's own stack keeps running after the installer's Dagu exits (verified).

## Build and test

```sh
installer/macos/build.sh          # → installer/macos/dist/Fyso Installer.app and Fyso-Installer.dmg
```

Unattended run for tests (no form; the window closes by itself): `FYSO_AUTO=1 FYSO_NAME=… FYSO_FOLDER=… [FYSO_SOURCE=… FYSO_REF=…] "dist/Fyso Installer.app/Contents/MacOS/fyso-installer"`.

Verified 2026-11-06 on macOS (arm64): from `gh:fyso-dev/agentic-framework@main`, all 15 steps succeeded, the stack answered (panel 200, Dagu/OMB/Caddy ready) and the initial commit used the person's git identity; with an unreachable template, the window marked "Proyecto" failed, its dependants "no se ejecutó", and the installer exited 1. Sizes: app 34 MB, dmg 21 MB (swiftDialog is most of it). Also verified: a custom user and a password with quotes log in (200) while `admin/admin` is refused (401), the password appears nowhere in the installer's Dagu data, and a second project got the next free block (8410) while the first used 8400.

UI copy and workflow step titles are bundled from `installer/macos/locales/{es,en}.sh`. The first macOS preferred language selects English when it starts with `en`; Spanish is the fallback. `FYSO_LANG=es|en` overrides this for verification. Repeated project names receive a unique slug and matching directory suffix, bounded to 31 characters, also checking registered projects and running project sockets.

## Open items

- **Signing and notarization.** The app is not signed yet. A downloaded copy needs right-click → Open until it is signed with a Developer ID and notarized (`codesign`, `notarytool`). Signing must keep swiftDialog's own signature intact (no `--deep` re-sign).
- **macOS 13–14.** swiftDialog 3.x needs macOS 15; the 2.5 line supports older systems.
- **Private template.** The GitHub step disappears if `fyso-dev/agentic-framework` becomes public.
- **Linux and Windows delivery.** Follow D38 below. The Linux Zenity experiment was exploratory and has been archived outside the checkout; it is not the selected delivery or proof that Qt installation works.


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
