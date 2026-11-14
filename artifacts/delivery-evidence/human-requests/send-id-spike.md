# Native send identifier — isolated feasibility spike

Status: **partial feasibility evidence; the return gate is not passed**. Tested after reconstructing the extension from the local prototype commit. The earlier return-gate files under the system temporary directory were removed by a machine restart; their reported result remains historical conversation evidence, not a reproducible artifact.

## Result

On an isolated OpenMausBot 0.1.141 instance, the CLI accepted `--send-id` although that option was absent from `run --help`. Sending the same text to the same task with the same identifier returned the same message ID and timestamp; the result remained the same after restarting the isolated server with its data directory. Reusing the identifier with different text failed with a conflict. One bot turn was observed for the repeated identical message. No external effect was tested.

An isolated Dagu 2.24.0 fixture with a `human.task` and a delivery step was also exercised. With OpenMausBot stopped, the human step succeeded and delivery failed. After starting it, retrying only the delivery step succeeded. Repeating the retry with the same send ID and text returned the same message ID and timestamp; one matching message and one bot turn were observed in the fixture. The bot received the message in the same task and asked for more context.

## Reproduction outline

1. Select pinned Dagu 2.24.0, Node and OpenMausBot 0.1.141 executables. Create disposable data and DAG directories and choose unused loopback ports. Do not reuse a person's OpenMausBot or Dagu.
2. Start the isolated OpenMausBot and establish a disposable bot and task. Start Dagu with its own home, DAG directory, scheduler and coordinator ports. Local unauthenticated access is only for this isolated fixture.
3. Create a graph with `ask` as `human.task` and `deliver` depending on it. In the fixture only, invoke the selected Node and OpenMausBot executables explicitly with `run --bot <bot> 'Decision approved' --task <task> --wait none --send-id hrretrycheck12345678 --port <port> --json`.
4. Stop only the isolated OpenMausBot. Start the DAG and complete the human task over its isolated REST API. Observe `ask` succeeded and `deliver` failed.
5. Start the same isolated OpenMausBot data directory, then use Dagu `retry --run-id <run> --step deliver return-probe`. Confirm the run succeeds and the task receives the message.
6. Repeat the same step retry and compare the returned message ID and timestamp, the count of identical messages, and bot turns. Stop only the isolated processes.

## Limits

The fixture used explicit binary paths and static text; it did not run the product YAML unchanged or pass the actual human answer as its payload. It did not exercise a second authenticated browser session, gateway, a missing conversation, or a restart while waiting. The original product calls `openmausbot run` without a stable send ID. Message deduplication is not proof that arbitrary external effects of an agent happen exactly once. Therefore this result suggests a native option to investigate; it does not authorize a claim that the full feature is ready.

The 9 local Node tests for the reconstructed extension passed; they are mainly mocked and do not prove the return gate. The previous automatic approval review rejected `mise trust` on a temporary project because it would persist global trust state. This experiment instead used explicitly selected binaries in its disposable fixture and did not change global trust.
