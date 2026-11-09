import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DAGS } from "../api/types";
import { ActionError, ActionStatus } from "../components/Action";
import { useDaguAction } from "../lib/useDaguAction";
import { CopyLine } from "../components/ui";
import { useStore } from "../store";

const assistants = [
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "codex", label: "Codex" },
  { id: "claude-code", label: "Claude Code" },
];

function ConnectionActions() {
  const { t } = useTranslation();
  const { backend, mock } = useStore();
  const action = useDaguAction<{ target: string; mode: string; message: string }>(backend, DAGS.agentConnect, "result");
  const [active, setActive] = useState<string | null>(null);
  const running = action.phase === "running";
  const run = (target: string, mode: string) => {
    if (active) return;
    setActive(`${target}:${mode}`);
    void action.start({ TARGET: target, MODE: mode }).finally(() => setActive(null));
  };
  return <>
    <p>{t("mcp.hostNote")}</p>
    {mock && <p role="note">{t("mcp.demo")}</p>}
    {assistants.map(({ id, label }) => <div key={id} style={{ marginTop: 16 }}>
      <h3>{label}</h3>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["connect", "disconnect"] as const).map(mode => {
          const selected = active === `${id}:${mode}`;
          return <button key={mode} type="button" className={`btn btn-sm ${mode === "connect" ? "btn-pri" : "btn-soft"}`}
            disabled={active !== null || running} aria-busy={selected}
            onClick={() => run(id, mode)}>
            {selected ? t("mcp.busy") : t(`mcp.${mode}Button`)}
          </button>;
        })}
      </div>
    </div>)}
    <ActionStatus action={action} />
    <ActionError action={action} />
    {action.phase === "ok" && action.output && <pre style={{ whiteSpace: "pre-wrap" }} role="status">{action.output.message}</pre>}
  </>;
}

export function Mcp() {
  const { t } = useTranslation();
  const { project } = useStore();
  return (
    <main className="page page-mid">
      <header><h1 className="h1">{t("mcp.title")}</h1><p className="mute">{t("mcp.intro")}</p></header>
      <section className="card" style={{ padding: 20 }}>
        <h2 className="section-title">{t("mcp.prepare")}</h2>
        <p>{t("mcp.prepareBody")}</p>

      </section>
      <section className="card" style={{ padding: 20 }}>
        <h2 className="section-title">{t("mcp.connect")}</h2>
        <p>{t("mcp.connectBody")}</p>
        <ConnectionActions />
      </section>
      <section className="card" style={{ padding: 20 }}>
        <h2 className="section-title">{t("mcp.restart")}</h2><p>{t("mcp.restartBody")}</p>
        <h2 className="section-title">{t("mcp.verify")}</h2>
        {project.data && <p>{t("mcp.verifyBody", { slug: project.data.slug })}</p>}
        <CopyLine text={t("mcp.prompt")} />
      </section>
      <section className="card" style={{ padding: 20 }}>
        <h2 className="section-title">{t("mcp.trouble")}</h2><p>{t("mcp.troubleBody")}</p>

      </section>
    </main>
  );
}
