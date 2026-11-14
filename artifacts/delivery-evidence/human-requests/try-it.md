# Try the local first version

This is a local development delivery, not a published release. Use a fictional, non-sensitive question. The running fixture address and private credential file are provided in the delivery message rather than committed here.

1. Open **People / Personas**. Add a name, rename it, reload and verify it remains. This directory does not create a login account or change the shared session.
2. Open **Pending / Pendientes** under the Human requests extension. Read the question, context, intended recipient and consequences before answering. A person filter helps find requests; it does not make them private.
3. Choose an answer, optionally add context, enter the responding name and submit. Open recent activity to distinguish the saved response from delivery. For a bot-originated request, inspect that same originating conversation for its continuation.

The demonstration request creates no real installation or business change. Responder names are self-declared. There are no notifications or personal inbox permissions in this version. Cancellation and expiry are recorded decisions; they do not authorize a business action. A failed delivery can be retried from the recorded run without asking the person to answer again. Accepted message deduplication does not guarantee exactly-once external effects.

The [evidence index](README.md) separates authenticated generated-project checks, model-backed fixture checks and test-only HTTP receivers. The [normal lifecycle smoke](generated-lifecycle.md) records the actual setup, startup and green doctor. External callback integration and real-user acceptance remain operator checks. The bundled development extension does not yet have a versioned source for normal Copier upgrades.
