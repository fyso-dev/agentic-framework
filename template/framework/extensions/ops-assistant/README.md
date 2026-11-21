# ops-assistant extension

A weekly digest, a manual project maintenance workflow, the `automate-this` skill
and a monthly spend-cap alert per bot, using existing framework workflows and
observability. Contract,
decision (D70) and evidence: the framework's `docs/owner-extensions.md`.

From a generated project:

```sh
mise run ext:add ./framework/extensions/ops-assistant -- --defaults
mise run doctor
```

The guide people and agents read after installing is
`extensions/ops-assistant/README.md`. This file stays in the extension source.
