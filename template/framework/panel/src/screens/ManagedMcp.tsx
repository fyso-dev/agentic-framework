import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CopyLine } from "../components/ui";

export function ManagedMcp({ credentialPath }: { credentialPath?: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const [credential, setCredential] = useState<{ token: string; expiresAt: number }>();

  async function issue() {
    if (!credentialPath) return;
    setState("busy");
    setCredential(undefined);
    try {
      const response = await fetch(credentialPath, { method: "POST", cache: "no-store" });
      if (!response.ok) throw Error("credential");
      const data = await response.json();
      if (typeof data?.token !== "string" || typeof data?.expiresAt !== "number") throw Error("credential");
      setCredential({ token: data.token, expiresAt: data.expiresAt });
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return (
    <main className="workspace">
      <h1>{t("mcp.title")}</h1>
      {credentialPath ? (
        <section className="card">
          <p>{t("mcp.personal.description")}</p>
          <button type="button" className="btn btn-pri" disabled={state === "busy"} onClick={() => void issue()}>
            {state === "busy" ? t("common.loading") : t("mcp.personal.issue")}
          </button>
          {state === "failed" && <p role="alert">{t("mcp.personal.failed")}</p>}
          {credential && <>
            <p>{t("mcp.personal.endpoint")}</p>
            <CopyLine text={`${location.origin}/mcp`} />
            <p>{t("mcp.personal.token", { expiry: new Date(credential.expiresAt).toLocaleString() })}</p>
            <CopyLine text={credential.token} />
          </>}
        </section>
      ) : <p>{t("mcp.personal.unavailable")}</p>}
    </main>
  );
}
