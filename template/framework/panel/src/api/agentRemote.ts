// Remote MCP connection commands (D65), token included: fetched on the person's explicit
// action from the project's private setup adapter. Never cached, never through Dagu.
export type RemoteClient = { id: string; label: string; note?: "env" | "json" | "oauth" | "oauthHub" | "oauthCli"; commands: string[] };
export type RemoteCommands = { server: string; url: string; oauth?: boolean; clients: RemoteClient[] };
export class RemoteError extends Error {
  constructor(public code: string) { super(code); }
}
export async function agentRemote(mock: string | null): Promise<RemoteCommands> {
  if (mock) {
    const name = "fyso-foo-project", url = `${location.origin}/mcp`, token = "mock-token-not-a-secret";
    return { server: name, url, oauth: true, clients: [
      { id: "claude-desktop", label: "Claude Desktop · claude.ai", note: "oauth", commands: [url, "fyso-mcp", "mock-client-secret-not-a-secret"] },
      { id: "claude-code-oauth", label: "Claude Code (OAuth)", note: "oauthCli", commands: [`MCP_CLIENT_SECRET=mock-client-secret-not-a-secret claude mcp add --transport http --scope user --client-id fyso-mcp --client-secret --callback-port 33418 ${name} ${url}`] },
      { id: "claude-code", label: "Claude Code", commands: [`claude mcp add --transport http --scope user ${name} ${url} --header "Authorization: Bearer ${token}"`] },
      { id: "codex", label: "Codex", note: "env", commands: [`export FYSO_FOO_PROJECT_MCP_TOKEN=${token}`, `codex mcp add ${name} --url ${url} --bearer-token-env-var FYSO_FOO_PROJECT_MCP_TOKEN`] },
      { id: "other", label: "MCP", note: "json", commands: [JSON.stringify({ mcpServers: { [name]: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2)] },
    ] };
  }
  const response = await fetch("/api/agent/remote", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (response.status === 401) window.dispatchEvent(new Event("fyso-session-expired"));
  // Only the adapter's own error code is read; arbitrary bodies are never displayed.
  if (!response.ok) {
    let code = "failed";
    try { const body = (await response.json()) as { error?: unknown }; if (typeof body.error === "string" && /^[a-zA-Z]{1,32}$/.test(body.error)) code = body.error; } catch { /* keep the generic code */ }
    throw new RemoteError(code);
  }
  return response.json() as Promise<RemoteCommands>;
}
