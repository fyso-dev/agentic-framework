// One workflow an extension ships (project/workflows/ext-<ext>-*.yaml): last run, Run now, logs in Dagu.
import { useTranslation } from "react-i18next";
import { useStore } from "../store";
import { useDaguAction, type Action } from "../lib/useDaguAction";
import { ActionButton, ActionError, ActionStatus, useLogsUrl } from "./Action";
import { External } from "./ui";

export function ExtensionWorkflow({ dag }: { dag: string }) {
  const { t } = useTranslation();
  const { backend } = useStore();
  // Output keys differ per extension; the panel shows the run, not its output.
  const action = useDaguAction<unknown>(backend, dag, "result", { loadLast: true });
  const logs = useLogsUrl(dag);
  return (
    <li className="card action" style={{ listStyle: "none" }}>
      <div className="action-head">
        <p className="grow ellipsis"><span className="mono">{dag}</span></p>
        <ActionStatus action={action as Action<unknown>} />
        <External href={logs} className="step-link">{t("common.viewInDagu")} </External>
        <ActionButton action={action as Action<unknown>} label={t("ext.run")} busyLabel={t("ext.running")} onRun={() => void action.start()} />
      </div>
      <ActionError action={action as Action<unknown>} />
    </li>
  );
}
