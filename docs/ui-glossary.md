# User-facing glossary

People using a Fyso project see business concepts, never the names of the software underneath. This glossary maps each internal concept to the term used in UI copy: the panel, extension pages, the menu bar app, the installers and launcher tiles (`app.yaml` names).

It extends the [product vocabulary](panel-spec.md#product-vocabulary) (project assistants are **Agentes / Agents**).

## Where it applies

- **Applies:** every translated string (`locales/<lang>.json`, installer `locales/*.sh`), launcher tile names and descriptions (`framework/apps/*.yaml`, extension `app.yaml`), and any other text a person reads in a window or page.
- **Does not apply:** code identifiers, translation keys, routes, workflow and task names, file names, logs, CLI output, `doctor` messages, MCP tool descriptions for agents, and developer docs. They keep the technical names.
- **Allowed exceptions:**
  - A literal terminal command the person is asked to type (for example `mise run ext:add <id>`) stays verbatim.
  - Names of things the person chose or must recognize outside the project keep their own names: AI engines (Claude, Codex, Pi), GitHub, MCP servers, the Bot Architect profile, Composio and other connected services.
  - Project data shown as-is (bot names and titles, workflow IDs such as `fyso-agent-connect`, extension IDs, file names such as `team.yaml`).

## Terms

| Internal concept | Spanish (es, default) | English (en) | Notes |
|---|---|---|---|
| OpenMausBot (OMB) app | **Agentes** (tile); "la app de agentes" in sentences | **Agents** (tile); "the agents app" in sentences | Open button: "Abrir agentes" / "Open agents". |
| OMB native roster | Agentes en funcionamiento | Running agents | |
| OMB usage ledger / traces | Consumo de agentes / Trazas de agentes | Agent usage / Agent traces | Observability sources. |
| Dagu app | **Automatizaciones** | **Automations** | Open button: "Abrir automatizaciones" / "Open automations". |
| Dagu workflow (DAG) | flujo | workflow | |
| Dagu run | ejecución | run | |
| Dagu run log | registro (en Automatizaciones) | log (in Automations) | "Ver registro en Automatizaciones" / "View log in Automations". |
| Dagu MCP (bots ↔ workflows) | conexión de los agentes con los flujos | agents' connection to workflows | |
| Dagu `harness.run` agent | Agente en un flujo | Agent in a workflow | |
| Caddy (gateway, login) | acceso web | web access | |
| process-compose | procesos | processes | |
| mise (tools, tasks) | herramientas del proyecto | project tools | |
| sops + age | secretos / cifrado | secrets / encryption | |
| gitleaks | control de secretos | secret scanning | |
| Copier | plantilla | template | |
| The whole stack | servicios del proyecto; "reinicia el proyecto" | the project's services; "restart the project" | |
| SilverBullet | Conocimiento | Knowledge | Already the extension tile name. |
| herdr | — | — | Developer tool; never in UI copy. |

## Known gaps

- The Observability page lists recent Dagu runs (workflow IDs, run IDs, links to Dagu). The labels follow this glossary, but the section itself is a technical run log; its redesign is a separate task.
- The macOS installer still lists build tools without a business equivalent (Node.js, YAML, GitHub CLI, Go, pnpm/Tinyauth) as install steps.
- The default Workflow Architect bot title in `project/bots/team.yaml` ("Designs and fixes Dagu workflows") is project data and keeps the technical name.
- External extension repositories (for example `fyso-ext-human-requests`, `fyso-ext-silverbullet`) must apply the same terms in their own releases; the bundled copies here are updated.
