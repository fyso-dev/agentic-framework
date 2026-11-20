# ADR 0003 — One native menu bar app and CLI for every instance (D85)

Date: 2026-11-16 · Status: accepted (release candidate, D86) · Supersedes D34 (SwiftBar plugin) · Extends D35 (macOS installer)

## Context

A user test asked for a Tailscale-like experience on macOS: install **one** app from the `.dmg`; it lives in the menu bar for good (no window to close, opens at login) and shows the person's Fyso instances (projects) with their state. From it they open an instance's panel, create a new one (the existing installer form), choose the *current* one, and start or stop it. A general CLI does the same. A second edition ships with Fyso Biz and starts by logging in to fyso.biz.

Today there are two pieces, and neither fits:

- **Fyso Installer.app** (D35) is a bash script driving swiftDialog. It runs once per project and quits; its registry `~/Library/Application Support/Fyso/projects.tsv` (`port<TAB>folder`) already lists every installed project.
- **The menu bar** (D34) is a SwiftBar plugin: the person must install SwiftBar with Homebrew, open it, pick a plugin folder and run `mise run tray:install` from a project. It only sees projects that have run at least once.

## Options considered

| Option | Menu bar | CLI | Moving parts for the person | Verdict |
|---|---|---|---|---|
| Keep SwiftBar, bundle it in the dmg | SwiftBar (third-party app, its own updates and settings, asks for a plugin folder) | the Python plugin | 2 apps + a plugin link | Rejected: the request is precisely that nothing asks to set up SwiftBar |
| swiftDialog for the menu | swiftDialog has windows only, no status item | — | — | Not possible |
| Open-source menu bar frameworks (e.g. [xbar](https://github.com/matryer/xbar), [Menubar for Electron](https://github.com/max-mapper/menubar), Tauri tray) | yes | no | a runtime (Electron/WebView/Go) of 50–150 MB, or again a plugin host | Rejected: heavier than the native API they wrap |
| **SwiftUI [`MenuBarExtra`](https://developer.apple.com/documentation/swiftui/menubarextra)** (macOS 13+), one Swift file compiled with `swiftc` from the Command Line Tools | native status item, menu style | same binary with arguments | **1 app** | **Chosen** |

`MenuBarExtra` is Apple's own menu bar scene: no framework, no Xcode project (`swiftc` + a hand-written `Info.plist`, as `build.sh` already does for the installer). [`SMAppService.mainApp`](https://developer.apple.com/documentation/servicemanagement/smappservice) (macOS 13+) registers the app as a login item with no LaunchAgent file. The installer needs macOS 15 (swiftDialog 3.x), so the app's floor is 15 too.

## Decision

1. **One bundle, `Fyso.app`**, built by `installer/macos/build.sh`. Its executable `Contents/MacOS/fyso` is a native Swift binary (`installer/macos/app/Fyso.swift`):
   - **without arguments** it is the menu bar app (`LSUIElement`: no Dock icon, no window; closing nothing removes it). It registers itself as a login item on first launch (toggle in the menu).
   - **with arguments** it is the CLI: `fyso list | open | create | switch | start | stop | status | add`. On launch the app links `~/.local/bin/fyso` to itself (the same folder the installer uses for mise), so the CLI and the menu are **one implementation**: the menu calls the same functions the CLI exposes.
   - The installer script and swiftDialog move inside it (`Resources/fyso-installer.sh`, `Helpers/Dialog.app`, the layout of PR #65). **Create** runs that script unchanged: the same form, workflow and registry write. There is no separate *Fyso Installer.app* any more.
2. **Instances = the existing registry.** `projects.tsv` stays the source of truth (`port<TAB>folder`; entries whose folder is not a Copier project are skipped). Name, slug and URLs come from the project (`.data/panel/project.json`, else `.copier-answers.yml`; panel URL falls back to `http://panel.<slug>-<port>.localhost:<port>`, as `mise.toml` derives `FYSO_WEB_DOMAIN`). `fyso add <folder>` registers a project created by hand; the template's `mise run tray:install` now does exactly that.
3. **Status** comes from the stack's own process-compose socket `/tmp/fyso-<slug>-<port>.sock` (`curl --unix-socket … /processes`, curl ships with macOS): *running* (every process ok), *degraded*, *stopped*. No new daemon.
4. **Start/stop** run the project's own `mise -C <folder> run up|down` with the person's login-shell `PATH` (apps start with a minimal one; same rule as the installer and D34), output appended to `<folder>/.data/logs/tray.log`.
5. **Current instance**: one line in `~/Library/Application Support/Fyso/current` (the folder). It is the default target of `fyso open|start|stop|status` and the instance whose state colours the menu bar icon. A successful *create* makes the new instance current. `FYSO_HOME` overrides the support folder (tests; the installer honours it too).
6. **Biz edition**: the same build with `EDITION=biz` gives `Fyso Biz.app` (`FysoEdition=biz` in `Info.plist`, own bundle id). Its menu starts with **Iniciar sesión en Fyso Biz**, started automatically on first launch. Sign-in is OAuth 2.1 for native apps against Biz's own authorization server (D86): dynamic registration of one public client with the loopback redirect `http://127.0.0.1/callback`, PKCE S256, the browser at Biz's authorize page and a one-shot listener on `127.0.0.1:<ephemeral>` for the code (RFC 8252). The grant is saved as `FYSO_HOME/biz/oauth.json` (0600) in fyso-ext-biz's format. *Create* signs in first when needed, runs the installer with `FYSO_EDITION=biz`, moves the grant into the new project's `.data/ext/biz/oauth.json` and installs the `biz` extension (`ext.sh apply add biz`, the panel's install path; another origin given with `FYSO_BIZ_URL` uses `ext:add biz -- --defaults -d biz_url=…`). Biz rotates refresh tokens, so the app does not keep a copy: the next instance needs a new sign-in (usually one click while the Biz browser session lasts).
7. **i18n**: every menu and CLI string is in `installer/macos/app/locales/{es,en}.json` (i18next-style `{{name}}`); the first macOS preferred language picks `en`, else `es`; `FYSO_LANG` overrides. User-facing words: *Agentes*, *Automatizaciones*, never tool names.
8. **Signing** (PR #65, D86): the executable is a real Mach-O, so `sign.sh` signs the app with hardened runtime (`SIGN_IDENTITY`), notarizes and staples app and dmg (`NOTARY_PROFILE`, a keychain profile); PR #65's `launcher.c` is not needed. swiftDialog stays sealed in `Helpers` with its own signature.
9. **Unregistered stacks**: a running stack whose folder is not in the registry is found from its `/tmp/fyso-*.sock` owner's cwd (as D34 did; `lsof`, cached per socket) and listed under *En marcha, sin registrar* with *Añadir a Fyso*; `fyso list` marks it `+` and `--json` gives `registered: false`.
10. **Updates** (D86): at launch and daily the app reads this repository's GitHub Releases; the newest non-prerelease `macos-v<X.Y.Z>` with this edition's dmg, newer than `CFBundleShortVersionString` (`VERSION` in `build.sh`), shows *Actualizar a la versión X*. It opens the dmg download in the browser (quarantined, so Gatekeeper checks the notarization) and the person drags the new app over the old one. `fyso update [--check]` does the same.

## Migration from SwiftBar

- The template no longer ships `framework/tray/` (the SwiftBar plugin) nor its tests; `mise run tray:install` registers the project in the app's registry instead of linking a plugin. No SwiftBar fallback is kept: nothing needs it.
- On launch the app imports the projects remembered by the old plugin (`~/Library/Caches/fyso-tray/projects.json`) into the registry and removes SwiftBar's `fyso.10s.py` link only when it is a symlink to a `framework/tray/fyso.10s.py` (our own file). SwiftBar itself is left installed.

## Consequences

- One download, one icon, one CLI; the installer form is reached from the menu instead of being a separate app.
- Still custom code: one Swift file (~500 lines) — the menu and the CLI glue over existing pieces (registry, process-compose socket, `mise run up/down`, installer script). It is the macOS counterpart of D34's Python plugin, not a new service.
- Linux/Windows (D38) are unchanged; the CLI contract (`list/open/create/switch/start/stop`) is what a future Qt tray there would reuse.
- Open: a real Developer ID notarization of this layout and a real fyso.biz sign-in (both verified only against an ad-hoc signature and a local OAuth server); in-place install and relaunch on update (Sparkle, if wanted); a CI job that builds and publishes the release.
