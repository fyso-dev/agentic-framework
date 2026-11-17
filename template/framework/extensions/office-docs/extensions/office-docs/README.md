# Office documents

Bots deliver real Word, Excel, PowerPoint and PDF files instead of text.

| Skill | File | Made with |
|---|---|---|
| `word-docs` | `.docx` | pandoc 3.13 |
| `powerpoint-decks` | `.pptx` | pandoc 3.13 |
| `pdf-docs` | `.pdf` | pandoc 3.13 + Typst 0.15.1 |
| `excel-sheets` | `.xlsx` | Dagu's native `xlsx.write` (workflow `ext-office-docs-xlsx`) |

## Use it

1. Switch the skills on per bot: panel → Bots → a bot → Profile → Skills, then
   review and apply. Nothing is enabled by installing.
2. Ask the bot: "write the proposal for Acme as a Word document".
3. Files are written to `.data/ext/office-docs/out/`. With the **deliverables**
   extension the bot hands them over as a download link in the panel.

`excel-sheets` needs the bot to reach Dagu (`mcp:dagu:*`, or `dagu_execute` and
`dagu_read`).

## Company look

Optional, made once by a person and kept in git:

- `project/office-docs/reference.docx`: Word styles, header and footer.
- `project/office-docs/reference.pptx`: slide master.

The skills use them when they exist.

## Limits

- Documents are generated from Markdown. Editing an existing Word or PowerPoint file
  in place, tracked changes, charts, animations and PDF forms are out of scope.
- Excel formulas are written without computed values; Excel calculates them on open.
- `mise run office-docs:doctor` runs one real conversion of each kind.
