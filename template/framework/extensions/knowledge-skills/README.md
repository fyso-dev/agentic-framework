# knowledge-skills extension

Three skills over the project wiki (business interview, brand voice, wiki gardener)
and the scheduled `ext-knowledge-skills-garden` workflow. It complements the
SilverBullet extension and does not require it. Contract, decision (D69) and
evidence: the framework's `docs/owner-extensions.md`.

From a generated project:

```sh
mise run ext:add ./framework/extensions/knowledge-skills -- --defaults
mise run doctor
```

The guide people and agents read after installing is
`extensions/knowledge-skills/README.md`. This file stays in the extension source.
