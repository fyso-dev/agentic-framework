# SilverBullet extension verification

## Import with AI (2026-11-10, D56)

Same generated project (slug `sbint`, port block 29600, macOS, Claude engine),
extension reapplied from the `feat/silverbullet-import` branch. Synthetic
documents of a fictional company; one real agent turn per run (two runs, both
passed).

| Check | Observed result |
|---|---|
| Install | `ext:add … --overwrite` installed tusd 2.10.1, Uppy 6.0.7, extract-zip 2.0.1 and pandoc 3.13 through mise and started `ext-silverbullet-upload`; `mise run doctor` passed |
| Picker | Folder, zip and file picker inside the Knowledge page; "Turn into pages" disabled until something is uploaded |
| Upload | A folder (text, 2 Markdown, Word; a hidden file left out) and a zip: 5 resumable uploads stored outside the wiki, tagged with one batch |
| Agent | Started by the person from the page; 7 pages by topic in 4 folders, linked to each other, each with its source line |
| Facts | "PostGIS", "21 días", "acme rollback" and "9:30" (from Markdown, the zip, text and Word) are in the written pages |
| Report | `Importaciones/<date time>` links every new page; the home page links `Importaciones`; the editor opens the report |
| Leftovers | Upload and work directories empty after the run |
| Credential | A document with a credential-shaped value: the import failed in `prepare` ("possible credentials in: claves.md"), no page changed, the document was not kept |

`tests/silverbullet-import-browser.cjs` produced the screenshots and printed:

```json
{"picker":true,"folderAndZipUploaded":5,"pagesWritten":7,"factsKept":4,"reportLinksPages":true,"homeLinksImports":true,"uploadsCleared":true,"editorShowsReport":true,"credentialRefused":true,"pageErrors":0}
```

| Screenshot | Shows |
|---|---|
| [import-picker.png](import-picker.png) | The import opened from "Trae lo que ya tienes" |
| [import-uploaded.png](import-uploaded.png) | Folder and zip uploaded, ready to convert |
| [import-running.png](import-running.png) | The agent writing pages |
| [import-report.png](import-report.png) | Result and the report page in the editor |
| [import-refused.png](import-refused.png) | A document with a credential, refused |

Suites: `node --test tests/*.test.cjs` 114 passed (5 new in
`silverbullet-import.test.cjs`); `silverbullet-panel-browser.cjs` passed again;
`test_silverbullet.py` 4 passed; `check-paths.sh` passed.

**Not verified here:** the Codex engine, PDFs, folders near the limits (200
files, 4 MB of text), whether the agent's permission rules hold against a
hostile document (only the output gate is tested), Linux/Windows.

## Knowledge inside the panel (2026-11-10, D55)

Project generated from the `feat/silverbullet-integrated` branch (slug `sbint`,
port block 29600, macOS), full stack running, extension installed with
`mise run ext:add ./framework/extensions/silverbullet -- --defaults`.
Synthetic content only.

| Check | Observed result |
|---|---|
| Before the fix | Opening the `docs.` route as the administrator redirected to Tinyauth's `/unauthorized?resource=docs`; after a reapply SilverBullet stayed stopped (502) |
| Access rule | Runtime config has `apps.docs` copied from `panel`; `project/auth/tinyauth.yaml` untouched |
| Panel section | "Conocimiento" in the navigation, with its own icon; the page stays on the panel origin |
| Embedded editor | The real SilverBullet editor renders inside the page with the same web session |
| Feed by files | A Markdown file written to `project/wiki/` was served and shown in the embedded editor |
| Feed by bots | 4 bots listed; "Dar acceso" opened the bot's profile at the `project-knowledge` switch |
| Guide | Folds away and stays folded after a reload; English labels with `?lang=en` |
| Private slots | `panel/knowledge.js` 200, `mcp.sh` 404 |
| Login restart | The session survived a `web-auth` restart; the full-window editor opened without a login |
| Reapply | `ext:add … --overwrite`: the readiness probe failed once, process-compose restarted SilverBullet (`restarts: 1`), 200 afterwards |
| Project doctor | `mise run doctor`: all checks passed |

`tests/silverbullet-panel-browser.cjs` produced the screenshots and printed:

```json
{"navEntry":true,"guide":3,"embeddedEditor":true,"droppedFileVisible":true,"bots":4,"accessLinkOpensSkill":true,"guideFoldPersists":true,"english":true,"privateSlotsBlocked":true,"sessionSurvivesLoginRestart":true,"fullWindowEditor":true,"pageErrors":0}
```

| Screenshot | Shows |
|---|---|
| [panel-knowledge.png](panel-knowledge.png) | The section, the three ways to feed it and the editor on the seeded home page |
| [panel-knowledge-dropped-file.png](panel-knowledge-dropped-file.png) | A file dropped in `project/wiki/`, open in the embedded editor |
| [panel-bot-skill.png](panel-bot-skill.png) | Where "Dar acceso" lands: the bot's skill switch |
| [panel-knowledge-folded.png](panel-knowledge-folded.png) | Guide folded: the editor takes the page |
| [full-window-editor.png](full-window-editor.png) | The `docs.` route after the login restart |

Suites: `node --test tests/*.test.cjs` 109 passed (4 new in
`web-auth-config.test.cjs`); `test_silverbullet.py` 4 passed;
`test_web_auth_http.py` 12 passed with the project's Tinyauth and Caddy;
`test_extension_pages_copier.py` passed; `check-paths.sh` passed.

**Not verified here:** a bot writing a page in a live turn (no bot turn was run;
the read path is the 2026-11-10 record in the extension contract), the
marketplace install path, Linux/Windows, and a remote deployment.

## First run (2026-11-09)

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
