# Knowledge skills

Three skills over the project wiki (`project/wiki/`), for teams that start with
nothing written down.

| Skill | What the bot does |
|---|---|
| `business-interview` | Asks the owner about the company, one question at a time, and writes the answers as wiki pages after they confirm each summary |
| `brand-voice` | Writes everything an outside reader sees in the tone of one guide page (`Marca/Voz y tono`), and helps create that page |
| `wiki-gardener` | Reviews the wiki for broken links, old pages, contradictions and duplicates, proposes fixes and applies only the approved ones |

Switch them on per bot: panel → Bots → a bot → Profile → Skills, then review and apply.

## The gardener workflow

`ext-knowledge-skills-garden` runs on the schedule chosen at install (default:
Mondays 07:00, server time) and on demand. It writes **one report page**,
`Mantenimiento/<date>` (`Maintenance/<date>`), and changes no other page. No report is
written when it finds nothing.

- `PROVIDER`: `claude` or `codex` lets the project's coding engine read a private copy
  of the wiki and propose fixes for contradictions (uses AI on every run); `none`
  checks links and dates only.
- `STALE_DAYS`: a page unchanged for this many days is listed (default 180). Clean
  tracked pages use their last commit date; modified or untracked pages use their
  file modification time.
- `mise run knowledge-skills:check` prints the same findings without AI or writing.

For a bundled local installation, review local edits before reapplying to change
the schedule or switch AI off:

```sh
mise run ext:add ./framework/extensions/knowledge-skills -- --defaults --overwrite -d garden_schedule="0 7 1 * *" -d garden_ai=false
```

A published tagged source can use `ext:update` instead.

## Works with, does not need, SilverBullet

The pages are plain files in `project/wiki/`. Bots reach them through the
`silverbullet` MCP when that extension is installed, and otherwise through the Dagu
MCP's wiki tools or their own file tools. People read the pages in the panel's
Knowledge page (SilverBullet) or in Dagu's wiki.

## Limits

- The interview and the brand guide are only as good as the answers; bots are told
  not to fill gaps.
- Contradiction proposals are AI-generated from the pages: review before approving.
  Large wikis are read in part (500 pages, 4 MB) and the report says so.
- Failed runs retain their private work directory for recovery; remove it after review.
- Link checks cover `[[wiki links]]` and relative Markdown links, not web addresses.
