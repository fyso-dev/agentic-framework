# Extension starter

Run `copier copy framework/extensions/_template ../fyso-ext-foo` to create an
extension repository. Customize the commented slots and publish version tags.
The scaffold uses `.extjinja` and `[[ ... ]]` so the framework Copier preserves
it literally; the generated extension uses `.slotjinja` and standard Jinja.
The sample MCP URL is illustrative only; replace it with a real MCP server or
remove that slot. Runtime data belongs in `.data/ext/<id>/`.
