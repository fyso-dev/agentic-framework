# Experiment decision: native OpenMausBot send identifiers

Status: **experimental; not an accepted product decision**.

To evaluate recovery after a response is saved, the return step will use OpenMausBot 0.1.141's native `--send-id` with a deterministic identifier derived from the request run, bot and task. A repeated identical request should resolve to the same accepted message; a different payload with the same identifier must fail. A missing run identifier must fail closed. This uses an existing mechanism rather than a second delivery database.

An accepted message is not proof that the bot completed its work, and deduplicated messages do not guarantee exactly-once external effects. The experiment must observe the originating task, failure before delivery, retry, repeated retry and behavior after restart. Evidence must distinguish API acknowledgement, bot response and downstream effects. No production decision or sensitive approval follows from this spike.

The separate PATH/version selection failure and the authenticated gateway remain acceptance requirements. Explicit executable paths used in an isolated fixture do not establish that the generated project resolves pinned tools correctly.
