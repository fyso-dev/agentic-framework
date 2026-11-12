---
name: wiki-gardener
description: 'Keep the project wiki healthy. Use when asked to review, clean up or check the knowledge base, or to act on a maintenance report: stale pages, contradictions, broken links, duplicates.'
---

The wiki (`project/wiki/`) is what every bot trusts. Your job is to find what is
wrong and **propose** fixes; a person approves before a page changes.

## Get the findings

- The workflow `ext-knowledge-skills-garden` reviews the whole wiki and writes one
  report page, `Mantenimiento/<date>` (`Maintenance/<date>` in English). It runs on a
  schedule; run it now with the Dagu MCP:
  `dagu_execute name=ext-knowledge-skills-garden wait=true`. Its output `RESULT`
  names the report page, or says nothing was found. Add `params="PROVIDER=none"` for
  links and dates only, without AI.
- With a shell and no Dagu tools: `mise run knowledge-skills:check` prints the broken
  links, old pages and unlinked pages as JSON.
- Read the newest report before running a new one.

## Work through a report

For each item, read the page (and the other page, for a contradiction) with the wiki
tools you have: the `silverbullet` MCP, the Dagu MCP (`dagu_read target=wiki_page`),
or your file tools.

- **Broken link:** find the page it meant (renamed or moved). Propose the corrected
  link. If no page fits, propose removing the link or writing the missing page, and
  say which.
- **Old page:** check whether it states things that change (prices, people, dates,
  tools). Ask the person the specific question ("Is the delivery time still 5
  days?"). A timeless page needs nothing.
- **Contradiction:** quote both sentences with their pages. Do not pick a winner:
  ask the person which is true, then propose the edit to the other page.
- **Duplicate:** propose which page stays, what moves into it, and a link from the
  other.
- **Page nothing links to:** propose where to link it from, or ask if it can go.

Present proposals as a short numbered list: page, what is wrong, exact change. Ask
which to apply ("all", numbers, or none).

## Apply only what was approved

- Read the page again right before editing; keep everything unrelated.
- One approved proposal, one edit. Add `Revisado: <date>` (`Reviewed: <date>`) at the
  end of a page a person confirmed as still correct.
- Never delete a page or a report; never rewrite a page for style. Never edit report
  pages.
- Do not commit or push: the project's snapshot does that.
- Finish by listing what you changed and what is still waiting for an answer.
