# Fyso panel

The panel SPA (PLAN §9): setup checklist, bots over `project/bots/team.yaml`, and the apps launcher. It has no backend: it reads `/config/*` and drives Dagu workflows through `/api/dagu/*`, as described in `docs/panel-contract.md` of the framework repository.

`dist/` is committed, so a generated project serves it as static files with no Node build step. Caddy serves it at the root of `panel.localhost:<port>`; routing uses the URL hash, so no SPA fallback is needed.

## Develop

From this directory, with the Node version pinned in `mise.toml`:

```sh
npm ci
npm run dev         # http://localhost:8448/?mock
npm run build       # tsc + vite build → dist/ (commit it)
npm run preview     # serves dist/ on port 8449
```

## Mock mode

`?mock` in the URL (or `VITE_MOCK=1` at build or dev time) swaps the HTTP backend for in-memory fixtures that follow the contract, with simulated Dagu runs. Pick a scenario with `?mock=<name>`:

| Scenario | What it shows |
|---|---|
| `ready` (default) | Every step done |
| `failed` | Codex not signed in, two unapplied bot changes |
| `first` | Nothing checked or saved yet |
| `empty` | No bots and no project apps |
| `applyfail` | Like `failed`, but applying the bots fails |

`?lang=es|en` and `?theme=light|dark` override the stored choices (useful for screenshots).

## Layout

- `src/api/` — contract types, the HTTP backend and the mock backend (its own lazy chunk).
- `src/lib/useDaguAction.ts` — one action = one Dagu workflow: `start` when it may overlap, otherwise `enqueue` (D80), then poll.
- `src/components/Action.tsx` — the action component (never · idle · running · ok · failed).
- `src/lib/team.ts` — reads and edits `team.yaml` with the `yaml` Document API (comments kept).
- `src/locales/<lang>.json` — every UI string. Adding a language is adding one file.
