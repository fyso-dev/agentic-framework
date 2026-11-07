import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../store";

type Identity = { authenticated: boolean; username: string; name: string; providerId: string };

/** The authority is the native login service, never browser storage or project config. */
export function SessionMenu() {
  const { t } = useTranslation();
  const mock = useStore().mock;
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (mock) return;
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        if (response.status === 401 || response.status === 403) { window.location.reload(); return; }
        if (!response.ok) { setError(true); return; }
        const { auth } = await response.json() as { auth: Identity };
        if (controller.signal.aborted) return;
        if (!auth.authenticated) { window.location.reload(); return; }
        const key = `${auth.providerId}:${auth.username}`;
        // A different browser session must not reuse the previous user's panel state.
        if (previous.current !== null && previous.current !== key) { window.location.reload(); return; }
        previous.current = key;
        setIdentity(auth); setError(false);
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { pending = false; }
    };
    const expired = () => window.location.reload();
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("fyso-session-expired", expired);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("fyso-session-expired", expired);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [mock]);
  if (mock) return null;
  async function logout() {
    setBusy(true); setError(false);
    try {
      const response = await fetch("/api/session/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok && response.status !== 401) throw Error();
      window.location.reload();
    } catch { setBusy(false); setError(true); }
  }
  return <div className="session-menu">
    {identity && <span className="only-desktop" title={identity.username}>{identity.name || identity.username}</span>}
    <button type="button" className="btn btn-sm" disabled={busy || !identity} onClick={() => void logout()}>{t("session.logout")}</button>
    {error && <span role="status">{t("session.unavailable")}</span>}
  </div>;
}
