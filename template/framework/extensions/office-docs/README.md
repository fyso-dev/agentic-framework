# office-docs extension

Skills for bots to deliver Word, Excel, PowerPoint and PDF files, over pinned pandoc,
Typst and Dagu's native `xlsx` actions. Contract, decision (D67) and evidence:
the framework's `docs/owner-extensions.md`.

From a generated project:

```sh
mise run ext:add ./framework/extensions/office-docs -- --defaults
mise run doctor
```

The guide people and agents read after installing is
`extensions/office-docs/README.md`. This file stays in the extension source.
