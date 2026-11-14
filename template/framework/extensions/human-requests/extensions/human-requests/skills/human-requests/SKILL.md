---
name: human-requests
description: Ask a person outside this conversation, or leave a decision for later, using the project's human requests workflow.
---

# Human requests

For a reversible choice, proceed on an explicit, recorded assumption and tell the person. Create a blocking request when the action cannot be undone or the person's answer changes the work. Never treat delivery or viewing as approval.

Write the question and context for the person who must answer, without requiring another screen: identify the requesting agent and the work it is doing; explain why the decision is needed, what each choice permits, and what happens if nobody answers. Include only facts known to you; say when information is missing. Do not include secrets or unnecessary personal data. Never describe a proposed operation as completed before it actually runs.

For example, before a test-only proposal to install an extension: ask “May I prepare this extension for review?” and explain which agent asks, the reason, that “Approve” allows the next review step, that “Decline” stops it, and that no action happens without an answer. This example does not authorize installation, and this feature must not be used for sensitive approvals without a separately enforced identity and authorization boundary.

See `extensions/human-requests/docs/approval-case.md` for the complete test-only scenario, including recipient selection, discovery, cancellation and expiry.

Use the Dagu MCP to start the root workflow `ext-human-requests-request`; provide `QUESTION`, `CONTEXT`, `RECIPIENT` (a name or `team`), and `BLOCKING`. Add the run label `assignee=<recipient>` and use a stable caller-selected run ID for retries. For an expiry, add exactly one `deadline=<Unix timestamp in seconds>` label; the label is authoritative. For choices, encode a JSON array of strings as UTF-8 hexadecimal lowercase and add `choices-hex=<hex>`; the label is authoritative. Labels are visible in run lists: never include sensitive content. Check Dagu accepts the label before claiming that a request was created. Do not include credentials or unnecessary personal information. A recipient label routes a request; it does not restrict access. A responder name is self-declared, not proof of identity.

For an answer to remain in the run, set `ORIGIN_TYPE=none`; read the run and its outputs with Dagu. For a project bot conversation, `ORIGIN_TYPE=omb` and `ORIGIN_REF` is JSON with exact `bot` and `task` IDs. Do not invent a conversation ID. Automatic retries can repeat an agent action: inspect the delivery step and originating conversation before manually retrying after an uncertain result. For HTTP, use only the operator-configured exact HTTPS endpoint whose receiver enforces the idempotency contract in `extensions/human-requests/HTTP.md`; an empty destination disables delivery. The run ID must be globally unique across all installations contacting that receiver (for example, a UUID) and stable across retries. An acknowledgement is not proof the receiver avoids duplicate effects.

Cancellation and expiration are responses, not approval. If the response changes the situation, review the context again before proceeding. Do not claim the original conversation resumed merely because a response was saved.
