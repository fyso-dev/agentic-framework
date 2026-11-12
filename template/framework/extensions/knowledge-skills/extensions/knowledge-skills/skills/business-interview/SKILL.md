---
name: business-interview
description: Interview the owner about their company and write what they say as pages of the project wiki. Use when a person wants bots to know the business and has no documents to import, or says "ask me about my company".
---

You build the company's knowledge base by asking, because nothing is written down
yet. The person is busy and not technical: short questions, plain words, their
language.

## Where pages go

The project wiki is the folder `project/wiki/` (Markdown). Use the first of these you
have: the `silverbullet` MCP (file tools on that folder, paths relative to it), the
Dagu MCP (`dagu_read target=wiki|wiki_page|wiki_search`, `dagu_change
type=upsert_wiki_page`), or your file tools on `project/wiki/`. Read `index.md` and
list the pages first: never ask what a page already answers.

## The interview

1. Say what you will do and how long it takes: about ten questions per topic, they
   can stop any time, and nothing is published outside the project.
2. One topic at a time, in this order unless the person prefers another:
   - **The company:** what it sells, to whom, where, since when, how many people.
   - **Customers:** who they are, how they arrive, what they ask most, what annoys them.
   - **Products and services:** the list, what each includes and excludes, prices only
     if the person gives them, usual terms.
   - **How work gets done:** the steps of the main job from request to payment, who
     does each, the tools used.
   - **People and roles:** who decides what, who to ask about what, working hours.
   - **Rules:** what must never happen, what always needs the owner's approval.
   - **Words:** terms, product names and abbreviations the company uses.
3. Ask **one question at a time**. Prefer concrete ones ("What happens when a client
   pays late?") to abstract ones ("Describe your collections process"). When an
   answer is vague, ask for the last real example.
4. After each topic, show a short summary and ask "Is this right? Anything missing?"
   Write the page only after a yes.
5. Stop when the person is tired. Tell them which topics are done and which remain,
   and record that in the page `Entrevista` (or `Interview`), so another session or
   another bot continues instead of starting over.

## Writing the pages

- One topic per page, named as a person would search for it. Follow folders already
  in use; with none, use `Empresa/`, `Clientes/`, `Productos/`, `Procedimientos/`,
  `Equipo/` (or the English equivalents when the wiki is in English).
- Start each page with `# Title` and one sentence saying what it answers.
- Write what the person said, in their words where it matters. **Never fill a gap
  with what is usual in the industry.** Unknown or undecided things go under
  "Pendiente" / "Open questions".
- End each page with `Fuente: entrevista con <name or role>, <date>` (`Source: …`).
- Update an existing page instead of creating a second one on the same topic; read it
  first and keep what is unrelated.
- Link the new pages from `index.md` or its section page, and link related pages
  with `[[Folder/Page]]`.
- Never write passwords, keys, card or bank account numbers, or personal data about
  third parties beyond name and role. If the person dictates one, do not store it
  and tell them why.

Finish by listing the pages you wrote so the person can review them in the panel.
