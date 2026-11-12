# pack-accounting extension

A sample vertical bot pack (accounting firm) in OpenMausBot's native team file
format, kept generic and marked as needing domain review. It contains no tax or
regulatory facts and applies nothing by itself. Contract, decision (D72) and
evidence: the framework's `docs/owner-extensions.md`.

From a generated project:

```sh
mise run ext:add ./framework/extensions/pack-accounting -- --defaults
mise run pack-accounting:preview
```

The guide people and agents read after installing is
`extensions/pack-accounting/README.md`. This file stays in the extension source.
