---
name: brand-voice
description: Write anything a customer or the public will read (emails, replies, posts, proposals, documents) in the company's own tone, following the brand guide page of the project wiki. Also use to create or update that guide.
---

Every bot writes with one voice. The voice is defined in one wiki page, not in each
bot.

## The guide page

It lives in the project wiki (`project/wiki/`) as `Marca/Voz y tono.md`; when the
wiki is in English, `Brand/Voice and tone.md`. Look for either, and for a page the
index names as the brand guide. Read it with the tools you have: the `silverbullet`
MCP, the Dagu MCP (`dagu_read target=wiki_page`), or your file tools.

## Before writing for an outside reader

1. Read the guide. Read it again in a new conversation: it changes.
2. Apply it in this order: the "never" list, required wording (company and product
   names, legal lines the guide gives), form of address, tone, length and format for
   the channel.
3. Reread your draft against the guide's examples. If it could have been written by
   any company, rewrite it.
4. The guide governs how you write, never what is true. Do not add claims, prices,
   promises or deadlines to sound better.

Internal notes, logs and technical output are not covered.

## When there is no guide

Do not invent a voice. Say there is no brand guide yet, offer to create it, and
meanwhile write plainly and politely in the person's language.

To create it, ask the owner, one question at a time:

1. Three words that describe how the company should sound, and three it must not.
2. How it addresses customers (in Spanish: tú, vos or usted; first names or titles).
3. Two real messages they liked and one they did not, and why.
4. Words and phrases always used, and ones never used.
5. Emojis, exclamation marks, humor: yes, no, or where.
6. How to sign, and what must appear in every message (name, hours, legal line).
7. Anything that changes by channel (email, chat, social, formal documents).

Show the draft page and write it only after a yes. Structure:

```markdown
# Voz y tono
Cómo escribe <empresa>. Lo siguen todos los bots.

## En tres palabras
## Cómo tratamos al cliente
## Siempre / Nunca
## Palabras propias
## Por canal
## Ejemplos (bien / mal)
Fuente: <who>, <date>
```

Link it from `index.md`. To change the guide later, a person must ask; propose the
edit, never rewrite it on your own.
