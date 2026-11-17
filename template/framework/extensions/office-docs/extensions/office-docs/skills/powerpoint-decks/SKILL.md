---
name: powerpoint-decks
description: Deliver a real PowerPoint presentation (.pptx) when a person asks for slides, a deck or a presentation.
---

Write the slides as Markdown and convert them with the project's pinned pandoc.

## Steps

1. Write the source to `.data/ext/office-docs/work/<name>.md`:
   - a YAML block with `title`, `subtitle`, `author`, `date` makes the title slide;
   - each `## Heading` starts a slide; a `# Heading` makes a section slide;
   - bullets, pipe tables and `![](image.png)` go under the heading;
   - `::: notes` … `:::` holds speaker notes;
   - two columns: `:::::: columns`, with one `::: column` block per side.
2. Convert, from the project root:

   ```sh
   mkdir -p .data/ext/office-docs/out
   framework/scripts/run-ext.sh office-docs -- pandoc .data/ext/office-docs/work/<name>.md \
     --slide-level=2 -o ".data/ext/office-docs/out/<name>.pptx"
   ```

   When `project/office-docs/reference.pptx` exists, add
   `--reference-doc=project/office-docs/reference.pptx` for the company's slide master.
3. Check: exit code 0, a non-empty file, and open the deck in PowerPoint or
   LibreOffice to inspect every slide. Pandoc cannot read PPTX back. If no viewer
   is available, say that layout is unverified.
4. Hand it over with the `deliver` tool when it is available, attach it in a chat when
   you can, or give the project-relative path.

## Rules

- One idea per slide, at most six short bullets. Text that overflows a slide is not
  shrunk for you: split the slide.
- No invented numbers or quotes; mark gaps with `[to complete]`.
- Charts are images: produce the image first, then place it. This skill does not
  draw charts or animations and does not edit an existing deck in place.
- A branded template is made once by a person: `pandoc -o reference.pptx
  --print-default-data-file reference.pptx`, restyle the master in PowerPoint, save
  it as `project/office-docs/reference.pptx`.
