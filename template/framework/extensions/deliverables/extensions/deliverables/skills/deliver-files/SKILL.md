---
name: deliver-files
description: Hand a finished file (document, spreadsheet, presentation, PDF, image, export) to the person as a download link in the panel, instead of a path they cannot open.
---

When you produce a file a person asked for, deliver it. A path on the server is not
a delivery.

## How

- With the `deliverables` MCP server: call `deliver` with `path` (relative to the
  project root) and, when the file name is technical, a `name` the person will
  recognize ("Propuesta Acme.docx"). It returns `url`.
- Without that server but with a shell, from the project root:
  `framework/scripts/run-ext.sh deliverables -- node extensions/deliverables/deliver.cjs put <path> --name "<name>"`.
  It prints the same JSON.
- `deliveries` (or `… deliver.cjs list`) lists what was already delivered.

Then tell the person, in one line, what the file is and give the link. The link
opens after the project's web login; the same file is listed on the panel's
**Entregables / Deliverables** page. In a chat, also attach the file when you have
a tool for attachments: the link is the lasting copy.

## Rules

- Deliver only finished work the person asked for or expects. Check the file first
  (it exists, opens, and holds what you say it holds).
- Only files inside the project can be delivered. Secrets, keys, login files and
  snapshots are refused: do not rename or copy one to get around that.
- A delivery never replaces an earlier one. A corrected version gets a new name or
  a number; say which link is current.
- People who may open the panel can download every delivered file. Do not deliver
  something meant for one person only without saying so first.
- Do not email, publish or send the link to third parties unless the person asked.
