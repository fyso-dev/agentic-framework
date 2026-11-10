# Fyso Panel — Design Spec (for Claude Design)

Status: **v2**, 2026-11-05. It replaces v1 (launcher + chat): the panel is now a **customization layer** over OpenMausBot, and has no chat (PLAN D13, D14). The visual design is produced in Claude Design, and the implementation follows it. See [PLAN.md §9](PLAN.md#9-panel-customization-layer--launcher-the-only-real-custom-code).

UI copy is **Spanish by default, with English included** (simple i18n, PLAN D12). Quoted strings below are the intended Spanish copy. Design for text that can be about 30% longer in other languages: no fixed-width buttons or labels.

## Purpose

The panel is where **the person customizing a Fyso project** sets it up. From it they:
- check that everything is ready (setup checklist),
- define the project's bots: which ones exist, their role, engine and model,
- open every app of the project (Dagu, OpenMausBot and the apps the project adds).

After that, people use **OpenMausBot** and **Dagu** directly, with everything already set up. The panel is not for daily use: it must feel simple, calm and minimal, like a setup console.

## Context

- **Users:** whoever customizes the project. They are technical, but the panel should not require it.
- **Login:** the browser's native username/password dialog (Caddy basic auth). **There is no login screen to design.**
- **Devices:** desktop first. It must work on a 390 px wide phone with no horizontal scroll.
- **Themes:** light and dark.
- **Brand:** Fyso. The product name is provisional, so the logo slot must be swappable.

## How actions behave (applies to every screen)

Every action in the panel (apply bots, check auth, save to git) runs as a **workflow in Dagu**. Every action button therefore follows the same pattern:

| Visual | Meaning | Dagu `statusLabel` |
|---|---|---|
| idle | Not running | — |
| in progress | Spinner, button disabled | `running`, `queued`, `waiting` |
| ok | Done | `succeeded`, `partially_succeeded` |
| failed | Short error + **"Ver logs en Dagu"** link (new tab) + "Reintentar" | `failed`, `aborted`, `rejected` |
| never | It has never run | `not_started`, or no runs |

Design this pattern once, as a reusable component, and use it everywhere.

## Structure

One top bar and three sections: **Puesta a punto** (home), **Bots** and **Apps**. Use tabs or a sidebar on desktop, and a bottom bar or menu on mobile.

### 1. Top bar

- Fyso logo + **project name**, e.g. "Fyso · Foo project".
- **Environment badge:** `local` or `servidor`.
- **Global state:** "Proyecto listo", "2 pasos pendientes" or "Sin datos".
- Primary button **"Abrir OpenMausBot ↗"**, always visible. It is the exit from the panel toward daily use.
- Light/dark theme toggle.
- **Language selector** (`ES` / `EN`): compact, next to the theme toggle. It defaults to the browser language.

### 2. Puesta a punto (home): setup checklist

A vertical list of steps. Each step shows:
- a state (done, pending, failed, checking),
- a title and one line of detail,
- a fix action when it is not done.

| Step | Detail example | Action when not done |
|---|---|---|
| Motores autenticados | "Claude (suscripción) ✓ · Claude API ✓ · Codex ✗" | "Verificar" · help text with the command to sign in |
| Bots aplicados | "3 bots, sin cambios pendientes" / "2 cambios sin aplicar" | "Revisar y aplicar" (goes to Bots) |
| Bots conectados a Dagu | "Los 3 bots pueden usar workflows" | "Verificar" |
| Guardado en git | "Último guardado: hace 12 min" | "Guardar ahora" · "Ver en Dagu" |

**States to design:**
- all steps done (a calm "Proyecto listo" state, with "Abrir OpenMausBot" prominent),
- one step failed,
- first run, where nothing has been checked yet,
- a step being checked.

### 3. Bots

Layout (D49, Claude Design B1.3): **list on the left, detail on the right**. On phones the list and the detail are separate screens with a back arrow.

**List:** avatar, name, a stack of connector logos and a dot for unapplied state (amber pending, accent new, red deleted; hollow = only in OpenMausBot). A **"+"** creates a bot. When there are unapplied changes, a compact strip offers **"Revisar y aplicar"** and discard.

**Detail:** header with avatar, name, role, state pill and a toolbar (chat in OpenMausBot, delete). Three tabs, one question each:

| Tab | Content |
|---|---|
| Perfil | Nombre, Rol; activity tiles (conversations, tools used, conversations with errors, estimated usage) from the observability snapshot; *Piensa con* (engine + model); *Autonomía* (Pregunta / Solo = `approval: ask/full`); chips for instructions file, skills and last commit |
| Instrucciones | Markdown editor with "+ Rol / Reglas / Tono / Ejemplos" section inserts, a tip, "Probar en OpenMausBot" and the 24,000-byte counter |
| Conectores · N | One card per active access: *Proyecto* (Dagu workflows), MCP servers (*Completo* or *Parcial*), apps (*Leer* / *Escribir*). Hover shows ✕ to remove. A dashed "+" card opens a logo picker of what can still be granted, plus "Conectar una aplicación nueva" |

Icons carry the meaning; secondary text goes in tooltips (`data-tip`), with an accessible name on every icon-only control. One vocabulary for access: *Leer*, *Escribir*, *Completo*.

**Save:** a floating bar ("Sin guardar" · undo · **Guardar**) appears only with changes. Guardar writes the team.yaml draft and applies app grants in the same click. Delete asks for confirmation.

**Apply flow** (key moment, design it carefully):
1. After saving, a **"Vista previa de cambios"** shows the plan before anything is applied, e.g.:
   - `bot "Run Operator": modelo haiku → sonnet`
   - `bot "Nuevo": crear`
   - "Plan: 1 a crear, 1 a cambiar, 0 a eliminar"
2. The note: "Antes de aplicar se guardan en git los ajustes hechos en OpenMausBot".
3. **"Aplicar"** runs it with the standard action pattern, or **"Cancelar"**.
4. On success: "Aplicado. Ya puedes usarlos en OpenMausBot" + "Abrir OpenMausBot ↗".

**States to design:**
- list with mixed states,
- empty list ("Este proyecto todavía no tiene bots"),
- form with validation errors (duplicate name, text too long),
- preview with changes,
- preview with no changes ("No hay cambios"),
- apply failed.

**Bot data:**

```ts
{
  name: string
  role: string
  engine: string          // id of a configured engine, e.g. "claude-sub"
  model: string
  instructions: string    // Markdown
  skills: { id: string, name: string, description: string, enabled: boolean }[]
  usesWorkflows: boolean
  state: "applied" | "pending" | "new"
}
```

### 4. Apps

Two tabs, kept in the address (`#/apps`, `#/apps?tab=ext`). Details live in tooltips; the page keeps text short.

**Abrir:** a tile launcher in up to three groups:
- **Framework:** always present. Dagu ("Workflows") and OpenMausBot ("Bots").
- **Proyecto:** the apps the project adds, plus a dashed "+" tile that copies `cp -r framework/apps/_template project/apps/mi-app`.
- **Apps de extensiones:** only when an extension adds apps.

**Extensiones:** installed extensions as cards (source, ready or missing secrets, capability counts for MCP, workflows, skills and apps, secret chips, version, and "Actualizar a vX" when the catalog has a newer tag), then the catalog with search, refresh, install and update. Terminal commands sit in a collapsed "Desde la terminal" block. The tab shows a badge with the number of available updates. Connectors live in their own section, not here.

**App tile:**
- **Icon**, from a generic name such as `workflow`, `bot` or `users`.
- **Name and a one-line description**, e.g. "Dagu · Workflows y ejecuciones".
- **Health dot**; its tooltip carries the state and the address, e.g. `dagu.localhost`.
- The whole tile opens a new tab; an arrow appears on hover.
- **Optional flag:** "Apagada", "No responde", or the access note, e.g. for OpenMausBot: "Login del proyecto".

**States to design:**
- the 4 health states,
- a disabled card (app turned off),
- an empty "Proyecto" group: "Este proyecto todavía no tiene apps propias", plus a copyable line `cp -r framework/apps/_template project/apps/mi-app`,
- initial loading with skeletons.

**Card data:**

```ts
{
  id: string
  name: string
  description: string
  icon: string
  url: string
  group: "framework" | "project"
  health: "ok" | "degraded" | "down" | "unknown"
  enabled: boolean
  accessNote?: string
}
```

## Out of scope

The panel has **no chat** (people chat in OpenMausBot), no workflow editing (that happens in Dagu), no secret values (only whether a secret is present), no user management, and no fine-tuning of bots: memory, preferences and fine-tuned instructions are done in OpenMausBot.

## Accessibility and details

- **AA contrast** in both themes.
- **Keyboard:** visible focus and full navigation.
- **State is never shown by color alone:** add an icon or text next to every dot or badge.
- **Relative times** ("hace 12 min") with the exact date on hover.
- **Plurals** are real plurals, not "paso(s)": "1 paso pendiente" / "2 pasos pendientes".

## Expected design deliverables

1. Views:
   - Puesta a punto: everything ready, and with one failure.
   - Bots: list, form, preview and applied.
   - Apps.
   - Mobile for at least the checklist and the form.
   - At least one view in English, to check text length.
2. The reusable action component with its 5 states.
3. Every state listed above.
4. Design tokens (colors, typography, spacing) for light and dark.

A code export (e.g. React + Tailwind) or a Claude Design link is enough to implement from.
