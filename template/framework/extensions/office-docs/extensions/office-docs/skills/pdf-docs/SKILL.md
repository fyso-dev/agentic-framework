---
name: pdf-docs
description: Deliver a PDF when a person asks for a document to send, print or sign that should look the same everywhere.
---

Write the content as Markdown and render it with the project's pinned pandoc and
Typst. No LaTeX or office suite is involved.

## Steps

1. Write the source to `.data/ext/office-docs/work/<name>.md` with a YAML block
   (`title`, `author`, `date`, `lang`).
2. Render, from the project root:

   ```sh
   mkdir -p .data/ext/office-docs/out
   framework/scripts/run-ext.sh office-docs -- pandoc .data/ext/office-docs/work/<name>.md \
     --pdf-engine=typst -V mainfont="Libertinus Serif" -V papersize=a4 -o ".data/ext/office-docs/out/<name>.pdf"
   ```

   Useful options: `--toc`; in the YAML block, `fontsize: 11pt`, `margin:` with `x:`
   and `y:` (for example `2.5cm`) and `mainfont:` (a font available to Typst (the command uses its bundled Libertinus Serif);
   check with `framework/scripts/run-ext.sh office-docs -- typst fonts`).
3. Check: exit code 0 and the file is not empty. Read Typst's error when it fails; it
   names the line of the generated source.
4. Hand it over with the `deliver` tool when it is available, attach it in a chat when
   you can, or give the project-relative path.

## Rules

- For a layout Markdown cannot express (letterhead, invoice grid), write a `.typ`
  file and compile it: `framework/scripts/run-ext.sh office-docs -- typst compile in.typ out.pdf`.
- This skill creates PDFs. It does not fill PDF forms, sign, merge or split files,
  and it does not read scanned documents.
- A PDF made here is not a signed or legally validated document. Say so when the
  person asks for a contract, invoice or official form.
- No invented content; mark gaps with `[to complete]`.
