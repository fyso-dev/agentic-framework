# Fyso Panel — Design Spec (for Claude Design)

Status: handed to design on 2026-11-05. The visual design is produced in Claude Design, and the implementation follows it. See [PLAN.md §9](PLAN.md#9-panel-the-only-real-custom-code).

UI copy is **Spanish by default, with English included** (simple i18n, PLAN D12). Quoted strings below are the intended Spanish copy. Design for text that can be about 30% longer in other languages: no fixed-width buttons or labels.

## Purpose

The panel is the front door of a Fyso project. From it you can:
- open every app of the project (Dagu, OpenMausBot and the apps each project adds),
- see whether each app is healthy,
- chat with a bot,
- see when everything was last saved to git.

**The panel does not edit configuration.** Configuration happens inside each app. The panel must feel simple, calm and minimal.

## Context

- **Users:** whoever develops or operates the project. They are technical, but the panel should not require it.
- **Login:** the browser's native username/password dialog (Caddy basic auth). **There is no login screen to design.**
- **Devices:** desktop first. It must work on a 390 px wide phone with no horizontal scroll.
- **Themes:** light and dark.
- **Brand:** Fyso. The product name is provisional, so the logo slot must be swappable.

## Structure

One top bar and one main screen. The **chat is a side panel** that can be opened from anywhere; on a phone it takes the full screen.

### 1. Top bar

- Fyso logo + **project name**, e.g. "Fyso · Food Partners".
- **Environment badge:** `local` or `servidor`.
- **Global health indicator:** "Todo funcionando", "1 app con problemas" or "Sin datos".
- **Chat** button that opens and closes the side panel.
- Light/dark theme toggle.
- **Language selector** (`ES` / `EN`): compact, next to the theme toggle. It defaults to the browser language.

### 2. Status strip: last save to git

- Text: "Último guardado: hace 12 min", with the exact time in a tooltip.
- **Result:** ok, failed or in progress.
- **"Guardar ahora"** button, with these states: idle, in progress (spinner, disabled), ok, failed.
- Secondary link **"Ver en Dagu"**, which opens the run in a new tab.

**States to design.** The data comes from the Dagu `snapshot` workflow, grouped into 4 visuals:

| Visual | Dagu `statusLabel` |
|---|---|
| ok | `succeeded`, `partially_succeeded` |
| in progress | `running`, `queued`, `waiting` |
| failed | `failed`, `aborted`, `rejected` |
| never | `not_started`, or no runs |

### 3. App grid (main content)

Two groups:
- **Framework:** always present. Dagu ("Workflows") and OpenMausBot ("Bots").
- **Proyecto:** the apps each project adds.

**App card:**
- **Icon**, from a generic name such as `workflow`, `bot` or `users`.
- **Name and a one-line description**, e.g. "Dagu · Workflows y ejecuciones".
- **Address** in small text, e.g. `dagu.localhost`.
- **Health dot** with 4 states:
  - healthy,
  - degraded (slow or erroring),
  - down,
  - unknown (not checked yet).
- **"Abrir"** button that opens a new tab. The whole card is clickable.
- **Optional access note**, e.g. for OpenMausBot: "Usa su propio acceso: la primera vez pide emparejar el dispositivo".

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

### 4. Side panel: chat with the Run Operator

There is one bot for now. Design the header with the **bot's name and avatar** anyway, because more bots can come later.

- **Header:** avatar, name ("Run Operator"), subtitle ("Consulta sobre workflows y ejecuciones") and a **"Nueva conversación"** button.
- **Recent conversations:** a collapsible list showing title (first message) and date. They are stored in the browser only.
- **Messages:**
  - User and bot messages are visually distinct.
  - The bot replies in **Markdown**: lists, code, links and small tables.
- **Composer:**
  - Multiline.
  - Enter sends; Shift+Enter inserts a new line.
  - A character counter appears near the **20,000 character** limit.

**Reply states** (mapped from the OMB Bot API):

| State | Bot API | What is shown |
|---|---|---|
| Sending | — | The user message, dimmed |
| Working | `202 working` (polled) | "El bot está trabajando…" with elapsed time; it can last minutes |
| Answered | `200` | The reply |
| Needs approval | `202 needs_approval` | Card: "El bot necesita una aprobación que solo se puede dar en OpenMausBot" + **"Abrir en OpenMausBot"** button |
| Error | `4xx` / `5xx` | Inline message with a "Reintentar" action |

**Errors with their own copy:**

| Case | Bot API | Copy (intent) |
|---|---|---|
| Bot busy | `409` | "Está terminando otra tarea, probá en un momento" |
| Too many messages | `429` | Rate limit reached, try again in a minute |
| Chat not configured | `401` / `403` | The bot key is missing or invalid, plus one help line for the admin |
| Bot could not answer | `502` | The bot could not answer, see OpenMausBot |

**Permanent, discreet notice:** "Este chat consulta; para crear o cambiar cosas usá OpenMausBot". Bot API turns run without tools, so the bot cannot act from this chat.

## Out of scope

The panel has no configuration forms, no editing of bots, workflows or secrets, and no user management. If a design needs any of these, it does not belong here.

## Accessibility and details

- **AA contrast** in both themes.
- **Keyboard:** visible focus and full navigation. The chat opens with a shortcut, e.g. `/` or `Ctrl+K`.
- **Health is never shown by color alone:** add an icon or text next to the dot.
- **Relative times** ("hace 12 min") with the exact date on hover.
- **Plurals** are real plurals, not "app(s)": "1 app con problemas" / "2 apps con problemas".

## Expected design deliverables

1. Three views: home (grid + strip), home with the chat open, and mobile. At least one view in English to check text length.
2. Every state listed above.
3. Design tokens (colors, typography, spacing) for light and dark.

A code export (e.g. React + Tailwind) or a Claude Design link is enough to implement from.
