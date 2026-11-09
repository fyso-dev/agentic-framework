# Fyso graphical installers (D38)

Qt Installer Framework owns the wizard, extraction, progress, errors and rollback.
The project folder is an editable Linux path. A folder-picker button is not shipped:
the native dialog rendered blank in the ARM64 compatibility fixture; its integration
needs a supported clean-host Qt build before being enabled.
The shared Dagu workflow owns project creation and runtime installation. Linux runs
natively; the Windows adapter invokes the same workflow in a non-root WSL2 distribution.

## Build

Requirements on the **build host**: Python 3.9+, mise 2026.11.2 and Qt Installer Framework
**4.7.0**. That version is available in Qt's common Linux/Windows tool catalog. Use
`installerbase --version` to verify it; `binarycreator` does not implement `--version`.

Build executables on their target OS. The source/package preparation is portable,
but it is not proof that a Windows executable was built or ran.

```sh
# Linux x64; run from this directory.
mise trust
mise run ifw:linux
# Then, from the repository root:
python3 installer/qt/build.py --target linux --ifw-root installer/qt/.data/qt/Tools/QtInstallerFramework/4.7
```

```powershell
# Windows; run from installer/qt.
mise trust
mise run ifw:windows
# Then, from the repository root:
python installer/qt/build.py --target windows --ifw-root installer/qt/.data/qt/Tools/QtInstallerFramework/4.7
```

`installer/qt/dist/` contains the native `.run` or `.exe`. `--prepare-only` assembles
metadata and payload without producing an executable. The script uses the native
`binarycreator`, not a custom packager. It generates a checksum-verified mise bootstrap
and the shared Dagu YAML from the template's pinned tools.

The manually dispatched workflow `.github/workflows/installer-build.yml` builds on
Ubuntu 22.04 x64 and Windows Server 2022 and retains artifacts. It does not publish a
release or deploy anything. Adding that workflow does not mean it has run.

**Qt binary dependencies:** a native build needs the libraries required by its
`installerbase`; check `ldd` on Linux before shipping. The ARM64 Qt 4.7 binary used for
local testing requires `libtiff.so.5` and `libwebp.so.6`, absent from stock Ubuntu 24.04.
The test VM used isolated compatibility libraries. The resulting ARM64 artifact is a
validation build, not a certified universal Linux download. Native x64/Windows builds,
clean-host dependency checks, signing and packaging acceptance remain separate gates.

## End-user prerequisites

- Linux: a graphical desktop and the Qt binary's system libraries, Python 3.9+, Bash,
  Git, curl, lsof and rsync. The adapter reports missing system tools; it does not silently
  run a distribution package manager as root.
- The chosen coding engine must be installed and signed in **inside Linux** for doctor
  to pass. No host credentials or subscriptions are copied by the installer.
- Windows: WSL2 with a non-root user and Python 3. The wizard's explicit **Set up WSL2**
  action invokes Microsoft's installer with UAC and `--no-launch`. Complete Ubuntu user
  creation and any requested restart, then reopen the wizard. It does not reboot,
  convert or delete existing distributions automatically. Default distribution: Ubuntu.
- Choose a Linux project directory on Windows, such as `~/Fyso`, rather than `/mnt/c`.
  Windows drive paths are not project paths in the Linux runtime.
- The private source repository requires GitHub access. Native `gh` device login prints
  its URL/code in the Qt details view. `FYSO_SOURCE` and `FYSO_REF` override the source
  for isolated validation; supplying them explicitly trusts that template.

## Ownership and failures

Qt installs only helper assets in a unique user cache directory. Projects live in the
separate folder selected in the form and remain owned by Copier/the user. Native Qt
rollback or maintenance removes helper assets, not project data, Git history or age keys.
A failed late check can leave a running project: the details show its directory; fix
its engine login and run `mise run doctor` there. Use `mise run down` in that project to
stop it. Do not delete the project to retry a login.

Slugs are unique across the chosen parent, registered installations and running socket
names. Core and extension ports are checked as one 20-port reservation. On Windows,
the native TCP listener inventory is also passed to the Linux selector. Windows browser
routing still needs verification on an actual Windows host.

Passwords cross the Qt boundary in private temporary requests, never installer values,
operation arguments or Dagu parameters. The Linux adapter consumes the request and
uses a mode-600 password file removed on exit. The Windows request directory receives
an explicit user-only ACL before the password is written. A held stdin channel ties
WSL work to its Windows parent; EOF requests cancellation and terminates only the
installer's child process group, never the entire distribution. Native WSL cancellation
and UAC/restart behavior remain unverified until a Windows-host run.

Fyso copy comes from `locales/es.json` and `locales/en.json`; Spanish is the fallback,
`FYSO_LANG=en` selects English. Standard Qt buttons/pages use Qt's system-locale
translations. Technical logs remain the native tools' output.

## Verification

```sh
node --test tests/qt-wizard.test.cjs
python3 -m unittest discover -s tests -p 'test_qt_installer.py'
python3 -m unittest discover -s tests -p 'test_windows_installer.py'
python3 -m unittest discover -s tests -p 'test_linux_headers.py'
```

The PowerShell tests execute the actual adapter with a disposable `wsl.exe` shim.
They cover Unicode stdin, paths with spaces, WSL1 rejection and exit-code propagation;
they do not establish Windows/WSL compatibility. Linux protocol tests cover process
cancellation and secret cleanup without real subscriptions.

For a native Qt smoke in an **isolated** Linux desktop:

```sh
FYSO_SOURCE=<local-template-checkout> FYSO_REF=main \
  <installer.run> --verbose --script tests/fixtures/qt-installer/smoke.qs
```

The fixture uses port 8500 and creates a project. Use a fresh test home; do not point
it at personal Dagu/OpenMausBot data. No real coding-engine credentials are provided
by the fixture, so doctor should report that missing prerequisite.

See [delivery evidence](../../artifacts/delivery-evidence/installer-cross-platform/README.md)
for observed results and platform limitations.
