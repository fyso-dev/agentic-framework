# Accounting firm pack (sample)

Four bots for an accounting firm, as an OpenMausBot team file. **A sample to adapt,
not a finished product: have a qualified accountant of the firm review every
instruction before the bots work with real clients.**

| Bot | Does | Never does |
|---|---|---|
| Client Intake | Keeps each client's checklist of documents and drafts the requests | Interprets documents |
| Bookkeeping Assistant | Prepares working papers and reconciliation drafts with traceable totals | Posts entries, computes taxes, chooses a treatment |
| Deadline Keeper | Tracks the calendar the firm wrote and reminds in time | Supplies or confirms a legal due date |
| Client Writer | Drafts client messages in the firm's voice | Sends anything, adds facts |

## What the pack does not contain

No tax rates, deadlines, forms, standards or legal rules of any country. The bots
are instructed to take every such rule from the firm's own wiki pages or people,
to name the source, and to stop when there is none. Write those pages first (the
**knowledge-skills** extension's interview helps).

All four bots ask before acting (`approval: ask`), have no computer use and prepare
drafts only. Filing, paying, signing and sending stay with people.

## Adopt it

1. Read `extensions/pack-accounting/souls/rules.md` and the four souls with the
   firm's accountant. Change what does not fit; they are yours to edit after copying.
2. Preview (changes nothing): `mise run pack-accounting:preview`.
3. Copy the bots you want from `extensions/pack-accounting/team.yaml` into
   `project/bots/team.yaml`. To edit a soul, copy it to `project/bots/souls/` and
   point the bot's `soul.file` there: files under `extensions/` are replaced when
   the pack is upgraded.
4. In the panel: Bots → Review and apply. The change is committed with the project.
5. Give the bots what they need per bot in the panel: the wiki (SilverBullet
   extension), document skills (office-docs), delivery (deliverables), and the
   connected applications each one may use.

The Bot Architect can do steps 3 and 4 in conversation ("add the Deadline Keeper
from the accounting pack").

## Limits

- Names, titles and instructions are in English; rename and translate freely. The
  bots answer in the person's language.
- The models are the project's engine defaults at install time.
- The pack was not reviewed by an accountant and was not run against a real firm.
