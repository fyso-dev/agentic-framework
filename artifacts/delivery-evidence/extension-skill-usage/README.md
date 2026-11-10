# Extension skill usage

## Overview
The installed extension card shows each skill's configured bot count and a link to Bots. Counts reflect the working team draft, exclude the chief and honor native disabled skills. This is configuration, not a live runtime inventory.

## User flow
Open Apps → Extensions, read the skill summary, then follow Choose bots to manage configuration.

## Acceptance matrix
| Scenario | Expected | Status | Evidence |
|---|---|---|---|
| Mock extension without enabled bots | Zero count and Bots link | ✅ | Browser assertion below |
| Native skill handling | Existing skill selection behavior remains valid | ✅ | Three regression tests below |
| Generated stack | Full runtime doctor | ⚠️ | No generated stack started; root has no doctor task |

## Visual evidence
Chrome verified the English mock extension card: `sample-ops · no bot uses it · Choose bots`, with the link pointing to `#/bots`. Screenshot capture was blocked by the browser tool filesystem policy; no image is claimed.

## Automated validation
- `npm run build --prefix template/framework/panel`: passed.
- `node --test tests/bot-form-connectors.test.cjs`: 3 passed.
- `bash scripts/check-paths.sh`: passed.
- `git diff --check`: passed.
- Chrome JavaScript assertion on the local static build with `?mock=ready&lang=en#/apps?tab=ext`: verified zero-count text and link destination.

## Scope and limitations
Presentation fixture only; no production or live OMB validation. A generated-stack doctor was not run: `mise run doctor` at the template root reports an unknown command. Nonzero counts and unavailable-team hiding were inspected statically, not asserted in the browser. Original checkout changes remain untouched.
