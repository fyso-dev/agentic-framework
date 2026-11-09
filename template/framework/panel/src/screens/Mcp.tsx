import { useTranslation } from "react-i18next";
import { CopyLine } from "../components/ui";
import { useStore } from "../store";

const assistants = [
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "codex", label: "Codex" },
  { id: "claude-code", label: "Claude Code" },
];

export function Mcp() {
  const { t } = useTranslation();
  const { project } = useStore();
  return (
    <main className="page page-mid">
      <header><h1 className="h1">{t("mcp.title")}</h1><p className="mute">{t("mcp.intro")}</p></header>
      <section className="card" style={{ padding: 20 }}>
        <h2 className="section-title">{t("mcp.prepare")}</h2>
        <p>{t("mcp.prepareBody")}</p>
        <CopyLine text="mise run up" />
      </section>
      <section className="card" style={{ padding: 20 }}>
        <h2 className="section-title">{t("mcp.connect")}</h2>
        <p>{t("mcp.connectBody")}</p>
        {assistants.map(({ id, label }) => <div key={id}><h3>{label}</h3><CopyLine text={`mise run agent:connect ${id}`} /></div>)}
      </section>
      <section className="card" style={{ padding: 20 }}>
        <h2 className="section-title">{t("mcp.restart")}</h2><p>{t("mcp.restartBody")}</p>
        <h2 className="section-title">{t("mcp.verify")}</h2>
        {project.data && <p>{t("mcp.verifyBody", { slug: project.data.slug })}</p>}
        <CopyLine text={t("mcp.prompt")} />
      </section>
      <section className="card" style={{ padding: 20 }}>
        <h2 className="section-title">{t("mcp.trouble")}</h2><p>{t("mcp.troubleBody")}</p>
        <h2 className="section-title">{t("mcp.disconnect")}</h2><p>{t("mcp.disconnectBody")}</p>
        {assistants.map(({ id, label }) => <div key={id}><h3>{label}</h3><CopyLine text={`mise run agent:disconnect ${id}`} /></div>)}
      </section>
    </main>
  );
}
