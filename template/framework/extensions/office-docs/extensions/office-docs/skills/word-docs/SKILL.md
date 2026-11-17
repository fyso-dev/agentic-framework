---
name: word-docs
description: Deliver a real Word document (.docx) when a person asks for a letter, report, proposal, contract draft or any text they will open or edit in Word.
---

Write the content as Markdown and convert it with the project's pinned pandoc. Do
not hand over Markdown or a path nobody can open.

## Steps

1. Write the source to `.data/ext/office-docs/work/<name>.md`. Start with a YAML
   block: `title`, optional `subtitle`, `author`, `date`, and `lang` (`es`, `en`…).
   Use `#` headings for sections, pipe tables for tables, and `![](path)` for images
   that exist on disk.
2. Convert, from the project root:

   ```sh
   mkdir -p .data/ext/office-docs/out
   framework/scripts/run-ext.sh office-docs -- pandoc .data/ext/office-docs/work/<name>.md \
     -o ".data/ext/office-docs/out/<name>.docx"
   ```

   Add `--toc` for a table of contents. When `project/office-docs/reference.docx`
   exists, add `--reference-doc=project/office-docs/reference.docx`: it carries the
   company's fonts, colors, header and footer.
3. Check the result before saying it is done: the command exited 0 and
   `pandoc <file>.docx -t plain | head` (through `run-ext.sh` as above) shows the text.
4. Hand it over. With the `deliver` tool (deliverables extension) the person gets a
   download link in the panel; in a chat, also attach the file when you have a tool
   for attachments. Without either, give the path relative to the project.

## Rules

- Content comes from the person, the project wiki or the conversation. Do not
  invent figures, names, dates or legal text; leave `[to complete]` and say so.
- Follow the brand guide page of the wiki when one exists.
- To change an existing .docx, convert it to Markdown first
  (`pandoc file.docx -t markdown -o file.md`), edit, and convert back. Layout that
  pandoc does not carry (text boxes, tracked changes, complex forms) is lost: tell
  the person before replacing their file, and never overwrite the original.
- A branded template is made once by a person: `pandoc -o reference.docx
  --print-default-data-file reference.docx`, restyle it in Word, save it as
  `project/office-docs/reference.docx`.
