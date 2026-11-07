# Installer app (macOS first) — D35

An end-user installer: a disk image with **Fyso Installer.app** to drag to Applications. Opening it shows a friendly window that lists each dependency with its state (waiting, installing, done, failed) and ends with "Abrir panel". Windows and Linux come later; see the end.

## Pieces (reused, not built)

| Piece | What | Pin |
|---|---|---|
| Window | **[swiftDialog](https://github.com/swiftDialog/swiftDialog)** (MIT, notarized by its author), bundled inside the app: no `.pkg`, no admin password. The installer drives it through its command file (`listitem`, `progress`, `message`, `button1text`) | 3.1.1 (`build.sh`, sha256-checked); **needs macOS 15+** |
| mise | `mise generate install-script`: downloads a pinned mise, sha256-checked, into `~/.local/bin/mise` (skipped when mise is already on `PATH`) | 2026.11.2 |
| Engine | **Dagu CLI** (`dagu start --dagu-home …`): runs the installation workflow with no server, no ports and no UI | 2.24.0 |
| Steps | `Resources/fyso-install.yaml`, **generated at build time** from `template/mise.toml.jinja`: one step per pinned tool (parallel; npm tools after Node), plus generate (Copier 9.19.1 via `uvx`), trust, git, setup, start | template pins |
| GitHub login | `gh auth login --web` (device code shown in the window) + `gh auth setup-git`, only while the template repository is private | GitHub CLI 2.95.0 |

The app itself is a folder with an `Info.plist` and a bash script (`fyso-installer.sh`, macOS bash 3.2); `build.sh` assembles it and the `.dmg` with `hdiutil`.

## Flow

1. **Form** (swiftDialog, styled like the panel's dark theme: its top bar as banner, `#0e0e12` background): project name, panel **user** and **password** (default `admin` / `admin`), coding engine, and **port** (prefilled with the first free block, editable, validated). The folder shows as text with a **Cambiar carpeta…** button that opens macOS's own folder picker (it has New Folder); a typed folder that does not exist is created.
   - **Ports never collide** with another Fyso project, running or stopped: the installer skips blocks in its registry (`~/Library/Application Support/Fyso/projects.tsv`, one line per installed project, entries whose folder is gone are ignored), the `port_base` of Fyso projects next to the chosen folder, running stacks' sockets, and any listening port.
   - **The password** goes to a private file (mode 600) that the template's `setup` reads through `FYSO_INITIAL_PASSWORD_FILE`; it is never a Dagu parameter (those are stored with the run) and the file is removed when the installer exits.
2. **Window** with every item, then: Apple Command Line Tools (`xcode-select --install` when missing, waits for Apple's installer), mise, Dagu, GitHub account.
3. **Workflow**: the script starts `dagu start` and maps each step's state from the run's `status.jsonl` (4 ok, 1 running, 2 failed, 3 not run) to the window. Parameters reach steps as environment variables.
4. **Engine session**: checks `claude auth status` / `codex login status`; a missing session is shown as pending, not as a failure.
5. **Done**: "Abrir panel" opens `http://panel.localhost:<port>`. A failure names the step in plain words and opens the log (`~/Library/Application Support/Fyso/installer/installer.log`) when the window closes.

The project's own stack keeps running after the installer's Dagu exits (verified).

## Build and test

```sh
installer/macos/build.sh          # → installer/macos/dist/Fyso Installer.app and Fyso-Installer.dmg
```

Unattended run for tests (no form; the window closes by itself): `FYSO_AUTO=1 FYSO_NAME=… FYSO_FOLDER=… [FYSO_SOURCE=… FYSO_REF=…] "dist/Fyso Installer.app/Contents/MacOS/fyso-installer"`.

Verified 2026-11-06 on macOS (arm64): from `gh:fyso-dev/agentic-framework@main`, all 15 steps succeeded, the stack answered (panel 200, Dagu/OMB/Caddy ready) and the initial commit used the person's git identity; with an unreachable template, the window marked "Proyecto" failed, its dependants "no se ejecutó", and the installer exited 1. Sizes: app 34 MB, dmg 21 MB (swiftDialog is most of it). Also verified: a custom user and a password with quotes log in (200) while `admin/admin` is refused (401), the password appears nowhere in the installer's Dagu data, and a second project got the next free block (8410) while the first used 8400.

## Open items

- **Signing and notarization.** The app is not signed yet. A downloaded copy needs right-click → Open until it is signed with a Developer ID and notarized (`codesign`, `notarytool`). Signing must keep swiftDialog's own signature intact (no `--deep` re-sign).
- **macOS 13–14.** swiftDialog 3.x needs macOS 15; the 2.5 line supports older systems.
- **Private template.** The GitHub step disappears if `fyso-dev/agentic-framework` becomes public.
- **Windows and Linux.** Linux can reuse the same workflow with a terminal or GTK front end; Windows needs WSL2 because the framework scripts are bash.
