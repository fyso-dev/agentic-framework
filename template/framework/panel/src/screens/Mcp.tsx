// "Maneja el proyecto desde tu IA": connects the project's own MCP server (fyso-<slug>, D33/D36)
// to the desktop and CLI agents of the Dagu host through the fyso-agent-connect workflow.
// MODE=status says which agents are installed and connected; connect, disconnect and open act
// on one. Those apps live on the Dagu host, so when the panel is opened from another machine the
// actions are hidden. Over HTTPS (an HTTPS provider extension, D62) the page points to the remote
// MCP endpoint (D63): a Run button makes sure the token exists through the same workflow (MODE=remote)
// and then shows the command for each client, fetched from the private setup adapter (D65); the
// terminal task stays as the copyable alternative. Over plain HTTP it says what is missing.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { agentRemote, RemoteError, type RemoteCommands } from "../api/agentRemote";
import { DAGS } from "../api/types";
import { ActionError } from "../components/Action";
import { IconChat, IconCheck, IconCode, IconInfo, IconPlay, IconPlug, IconSparkle, IconTerminal, Spinner } from "../components/Icons";
import { CopyLine } from "../components/ui";
import { useDaguAction, type Action } from "../lib/useDaguAction";
import { useStore } from "../store";

type AgentId = "claude-desktop" | "codex" | "claude-code";
type AgentStatus = { id: AgentId; label: string; desktop: boolean; found: boolean; connected: boolean };
type Status = { mode: "status"; server: string; agents: AgentStatus[] };
type Result = { target: AgentId; mode: "connect" | "disconnect" | "open"; message: string };

const AGENTS: { id: AgentId; name: string; Icon: typeof IconChat; tone: string; open: boolean }[] = [
  { id: "claude-desktop", name: "Claude Desktop", Icon: IconSparkle, tone: "warm", open: true },
  { id: "codex", name: "Codex", Icon: IconCode, tone: "ink", open: true },
  { id: "claude-code", name: "Claude Code", Icon: IconTerminal, tone: "warm", open: false },
];

/** The panel runs on the Dagu host only when it is opened through a loopback name. */
export const isLocalPanel = (host = location.hostname) =>
  /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || host.endsWith(".localhost");

function ServerChip({ name }: { name: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked: the name stays selectable */ }
  };
  return (
    <span className="as-srv" data-tip={t("mcp.serverTip")}>
      <span className="mono ellipsis">{name}</span>
      <button type="button" className="bd-ib" aria-label={copied ? t("common.copied") : t("mcp.copyServer")} onClick={() => void copy()}>
        {copied ? <IconCheck size={15} /> : <IconCopy />}
      </button>
    </span>
  );
}

const IconCopy = () => (
  <svg aria-hidden="true" width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </svg>
);

function AgentCard({ def, status, busy, just, onRun }: {
  def: (typeof AGENTS)[number];
  status?: AgentStatus;
  busy: string | null;
  just: boolean;
  onRun: (target: AgentId, mode: Result["mode"]) => void;
}) {
  const { t } = useTranslation();
  const missing = status ? !status.found : false;
  const connected = !!status?.connected;
  const running = busy?.startsWith(`${def.id}:`) ?? false;
  const locked = busy !== null;
  const state = !status ? "loading" : connected ? "on" : missing ? "missing" : "off";
  const { Icon } = def;
  return (
    <li className={`as-card${missing ? " missing" : ""}`}>
      <div className="as-card-head">
        <span aria-hidden="true" className={`as-logo ${def.tone}`}><Icon size={22} /></span>
        <div className="as-card-title">
          <h3>{def.name}</h3>
          <p className="sub">{t(`mcp.kind.${def.id}`)}</p>
        </div>
        {state === "loading" ? (
          <span className="skel" style={{ width: 84, height: 24, borderRadius: "var(--fy-radius-pill)" }} />
        ) : (
          <span className={`ap-tag${state === "on" ? " ok" : ""}`} data-tip={t(`mcp.stateTip.${state}`)}>
            <span aria-hidden="true" className="as-dot" />{t(`mcp.state.${state}`)}
          </span>
        )}
      </div>
      {just && connected && <p className="as-hint"><IconInfo size={14} />{t(`mcp.after.${def.id}`)}</p>}
      <div className="ap-foot">
        {running ? (
          <span className="ap-tag acc" role="status"><Spinner />{t(`mcp.busy.${busy?.split(":")[1]}`)}</span>
        ) : state === "off" ? (
          <button type="button" className="btn btn-pri ap-btn" disabled={locked} onClick={() => onRun(def.id, "connect")}>
            <IconPlug size={16} />{t("mcp.connect")}
          </button>
        ) : state === "on" && def.open ? (
          <button type="button" className="btn btn-pri ap-btn" disabled={locked} data-tip={t(`mcp.openTip.${def.id}`)} onClick={() => onRun(def.id, "open")}>
            <IconChat size={16} />{t("mcp.open")}
          </button>
        ) : state === "on" ? (
          <span className="as-hint">{t("mcp.cliHint")}</span>
        ) : state === "missing" ? (
          <span className="as-hint">{t("mcp.missingHint")}</span>
        ) : null}
        <span className="grow" />
        {state === "on" && !running && (
          <button type="button" className="bd-ib danger tip-r" disabled={locked} aria-label={t("mcp.disconnect")} data-tip={t("mcp.disconnectTip")} onClick={() => onRun(def.id, "disconnect")}>
            <IconUnplug />
          </button>
        )}
      </div>
    </li>
  );
}

const IconUnplug = () => (
  <svg aria-hidden="true" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 7V4M15 7V4M7 7h10v4a5 5 0 0 1-10 0zM12 16v4M4 4l16 16" />
  </svg>
);

function LocalAgents({ server }: { server: (name: string) => void }) {
  const { t } = useTranslation();
  const { backend } = useStore();
  const status = useDaguAction<Status>(backend, DAGS.agentConnect, "result");
  const action = useDaguAction<Result>(backend, DAGS.agentConnect, "result");
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<AgentId | null>(null);
  const [failed, setFailed] = useState<AgentId | null>(null);

  useEffect(() => { void status.start({ MODE: "status" }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (status.output?.server) server(status.output.server); }, [status.output, server]);

  const run = async (target: AgentId, mode: Result["mode"]) => {
    if (busy) return;
    setBusy(`${target}:${mode}`);
    setFailed(null);
    const result = await action.start({ TARGET: target, MODE: mode });
    setBusy(null);
    if (!result) { setFailed(target); return; }
    setLast(mode === "connect" ? target : null);
    if (mode !== "open") await status.start({ MODE: "status" });
  };

  const byId = new Map((status.output?.agents ?? []).map((a) => [a.id, a]));
  return (
    <>
      {status.phase === "failed" && (
        <div role="alert" className="banner banner-down">
          <p className="grow"><strong style={{ color: "var(--fy-down)" }}>{t("mcp.statusError")}</strong> {status.error}</p>
          <button type="button" className="btn btn-sm btn-soft" onClick={() => void status.start({ MODE: "status" })}>{t("common.retry")}</button>
        </div>
      )}
      <ul className="ap-grid wide as-grid">
        {AGENTS.map((def) => (
          <AgentCard key={def.id} def={def} status={byId.get(def.id)} busy={busy}
            just={last === def.id} onRun={(id, mode) => void run(id, mode)} />
        ))}
      </ul>
      {failed && <ActionError action={action as Action<unknown>} />}
    </>
  );
}

/** Remote view over HTTPS: run the task through Dagu, then show each client's command. */
function RemoteConnect() {
  const { t } = useTranslation();
  const { backend, mock } = useStore();
  const ensure = useDaguAction<{ mode: "remote"; server: string; url: string; created: boolean }>(backend, DAGS.agentConnect, "result");
  const [busy, setBusy] = useState(false);
  const [commands, setCommands] = useState<RemoteCommands | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    if (busy) return;
    setBusy(true); setError(null); setCommands(null);
    const ensured = await ensure.start({ MODE: "remote" });
    if (ensured) {
      try { setCommands(await agentRemote(mock)); }
      catch (e) { setError(e instanceof RemoteError ? e.code : "failed"); }
    }
    setBusy(false);
  };
  const known = ["httpsRequired", "noToken", "origin", "unauthorized"];
  return (
    <div className="grow as-remote-run">
      <h2 id="as-remote-t">{t("mcp.remoteReadyTitle")}</h2>
      <p className="mute">{t("mcp.remoteReadyBody")}</p>
      <div className="as-run">
        <CopyLine text="mise run agent:remote" />
        <button type="button" className="btn btn-pri ap-btn" disabled={busy} onClick={() => void run()}>
          {busy ? <Spinner /> : <IconPlay size={16} />}{busy ? t("mcp.remoteRunning") : t("mcp.remoteRun")}
        </button>
      </div>
      {!busy && <ActionError action={ensure as Action<unknown>} />}
      {error && <p role="alert" className="action-error"><strong>{t(`mcp.remoteError.${known.includes(error) ? error : "failed"}`)}</strong></p>}
      {commands ? (
        <>
          <p className="as-hint"><IconInfo size={14} />{t("mcp.remoteSecret")}</p>
          <ul className="as-clients">
            {commands.clients.map((client) => (
              <li key={client.id}>
                <h3>{client.id === "other" ? t("mcp.remoteOther") : client.label}</h3>
                {client.note && <p className="sub">{t(`mcp.remoteNote.${client.note}`)}</p>}
                {client.commands.map((command, at) => (client.note === "oauth" || client.note === "oauthHub")
                  ? <div key={command}><p className="mute">{t(`mcp.remoteField.${["url", "clientId", "clientSecret"][at]}`)}</p><CopyLine text={command} /></div>
                  : <CopyLine key={command} text={command} />)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mute">{t("mcp.remoteAddress")}</p>
          <CopyLine text={`${location.origin}/mcp`} />
        </>
      )}
    </div>
  );
}

export function Mcp() {
  const { t } = useTranslation();
  const { project, mock } = useStore();
  const local = isLocalPanel();
  const [server, setServer] = useState<string | null>(null);
  const name = server ?? (project.data ? `fyso-${project.data.slug}` : null);
  return (
    <main className="page page-wide ap-page">
      <div className="ap-head">
        <h1>{t("mcp.title")}</h1>
        <span className="bd-ib" tabIndex={0} aria-label={t("mcp.intro")} data-tip={t("mcp.intro")}><IconInfo size={16} /></span>
        {mock && <span className="as-demo" tabIndex={0} data-tip={t("mcp.demo")}>{t("mcp.demoTag")}</span>}
        <span className="grow" />
        {name && <ServerChip name={name} />}
        {local && (
          <span className="bd-ib tip-r" tabIndex={0} aria-label={t("mcp.hostNote")} data-tip={t("mcp.hostNote")}><IconHost /></span>
        )}
      </div>

      {local ? <LocalAgents server={setServer} /> : (
        <section className="as-remote" aria-labelledby="as-remote-t">
          <span aria-hidden="true" className="as-logo"><IconHost /></span>
          {location.protocol === "https:" ? <RemoteConnect /> : (
            <div className="grow">
              <h2 id="as-remote-t">{t("mcp.remoteTitle")}</h2>
              <p className="mute">{t("mcp.remoteBody")}</p>
            </div>
          )}
        </section>
      )}

      <section className="as-try" aria-labelledby="as-try-t">
        <span aria-hidden="true" className="as-logo"><IconCheck size={22} /></span>
        <div className="as-try-body">
          <h2 id="as-try-t">{t("mcp.tryTitle")}</h2>
          <CopyLine text={t("mcp.prompt")} />
        </div>
      </section>

      <details className="ap-term">
        <summary><IconInfo size={16} />{t("mcp.troubleTitle")}</summary>
        <ol className="as-help">
          <li>{t("mcp.trouble1")}</li>
          <li>{t("mcp.trouble2")}</li>
          <li>{t("mcp.trouble3")}</li>
        </ol>
      </details>
    </main>
  );
}

const IconHost = () => (
  <svg aria-hidden="true" width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />
  </svg>
);
