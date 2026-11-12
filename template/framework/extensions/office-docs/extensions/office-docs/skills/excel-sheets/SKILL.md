---
name: excel-sheets
description: Deliver a real Excel workbook (.xlsx) when a person asks for a spreadsheet, a table of data, a list to filter or figures they will keep working on in Excel.
---

Excel files are written by Dagu's own `xlsx` actions, through the project's Dagu
MCP. You prepare the data; the workflow `ext-office-docs-xlsx` writes the workbook.

## A table of data

1. Write the rows to `.data/ext/office-docs/work/<name>.csv` (header row first,
   UTF-8, comma separated, quotes around fields with commas). JSON (a list of
   objects) and JSON Lines work too. Numbers without thousand separators and with a
   dot as decimal mark; dates as `YYYY-MM-DD`.
2. Run the workflow and wait:

   ```
   dagu_execute name=ext-office-docs-xlsx
     params="SOURCE=.data/ext/office-docs/work/<name>.csv NAME=<workbook name> SHEET=<sheet name>"
     wait=true
   ```

   Its output `RESULT` is the workbook path: `.data/ext/office-docs/out/<NAME>.xlsx`.
   A workbook with the same name is replaced.
3. If the run fails, read the failing step (`dagu_read target=run`): `check` explains
   a bad name or source; `write` explains a bad file.
4. Hand it over with the `deliver` tool when it is available, attach it in a chat when
   you can, or give the project-relative path.

## Formulas, several sheets, filling a template

The ready workflow writes one sheet of plain values. For more, author a project
workflow with Dagu's actions, after reading `dagu_read target=reference
name=authoring` (search it for `xlsx`): `xlsx.write` and `xlsx.append` for rows,
`xlsx.write_cells` for single cells and formulas (`{formula: "=SUM(B2:B9)"}`, styles
of a template are kept), `xlsx.sheet` to add or copy sheets, `xlsx.read` and
`xlsx.info` to inspect a workbook a person gave you. Create it with `dagu_change`
(preview, then apply) in `project/workflows/`, never under the `ext-` prefix.

## Rules

- Figures come from the person, a workflow output or a connected system. Never
  invent or estimate a number to fill a cell; leave it empty and say which.
- Formulas are stored without computed values: Excel calculates them when the file
  is opened. Say so if the person will read the file with something else.
- Do not edit the person's original workbook in place; write a new one.
