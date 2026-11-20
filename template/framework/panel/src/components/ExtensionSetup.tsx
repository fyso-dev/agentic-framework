// Guided setup of an extension's declared secrets (D50): open the provider's key page, paste
// the block it shows, save. Values go only to the private setup adapter, which encrypts them
// with SOPS; the panel never reads them back.
import { useState, type CSSProperties, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useCapability } from "../lib/access";
import type { Extension } from "../api/types";
import { localized } from "../lib/i18n";
import { isExample, parseEnvBlock } from "../lib/envBlock";

const ERRORS = ["invalidInput", "pendingSecrets", "busy", "saveFailed", "notFound", "unavailable"];
const host = (url: string) => { try { return new URL(url).host; } catch { return url; } };
// Pasted keys stay masked where the browser supports it (textareas have no password type).
const masked = { WebkitTextSecurity: "disc", height: "auto", minHeight: "5.5em", resize: "vertical" } as CSSProperties;

export function ExtensionSetup({ ext, onSaved }: { ext: Extension; onSaved: () => void }) {
  const { t, i18n } = useTranslation();
  const canConfigure = useCapability(`action:extension:${ext.id}:configure`);
  const names = ext.secrets.map((x) => x.name);
  const missing = ext.secrets.some((x) => x.required && !x.set);
  const links = [...new Set(ext.secrets.map((x) => x.url).filter((u): u is string => !!u))];
  const paste = ext.secrets.length > 1;
  const [open, setOpen] = useState(missing);
  const [block, setBlock] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const { values: detected, examples } = parseEnvBlock(block, names);
  const typed = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim() && !isExample(v.trim())));
  const send = { ...detected, ...typed };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !Object.keys(send).length) return;
    setBlock(""); setValues({}); setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch(`/api/extensions/${encodeURIComponent(ext.id)}/secrets`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: send }),
      });
      if (response.status === 401) window.dispatchEvent(new Event("fyso-session-expired"));
      const result = await response.json();
      if (!response.ok) {
        setMessage(ERRORS.includes(result.error) ? result.error : "saveFailed"); setFailed(true); return;
      }
      const outcome = result.missing?.length ? "stillMissing" : result.check === "failed" ? "checkFailed" : result.check === "ok" ? "ready" : "saved";
      setMessage(outcome); setFailed(outcome === "checkFailed" || outcome === "stillMissing");
      setOpen(outcome !== "ready" && outcome !== "saved");
      onSaved();
    } catch {
      setMessage("saveFailed"); setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!canConfigure || ext.secrets.length === 0) return null;
  const fields = ext.secrets.map((x) => {
    const desc = x.description ? localized(i18n.language, x.description, x.description_i18n) : undefined;
    return (
      <label key={x.name} className="field">
        <span><span className="mono">{x.name}</span>{!x.required && <span className="mute"> · {t("ext.setup.optional")}</span>}</span>
        {desc && <span className="mute">{desc}</span>}
        <input
          type="password" className="input" autoComplete="new-password" spellCheck={false} maxLength={4096} disabled={busy}
          placeholder={x.set ? t("ext.setup.keep") : ""}
          value={values[x.name] ?? ""}
          onChange={(event) => setValues({ ...values, [x.name]: event.target.value })}
        />
      </label>
    );
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {message && <p role={failed ? "alert" : "status"} className={failed ? "banner banner-down" : "banner"}>{t(`ext.setup.${message}`)}</p>}
      {!open ? (
        <div>
          <button type="button" className="btn btn-ghost" onClick={() => { setOpen(true); setMessage(""); }}>{t("ext.setup.change")}</button>
        </div>
      ) : (
        <form className="form" onSubmit={(event) => void submit(event)}>
          {links.length > 0 && (
            <ol>
              <li>
                <strong>{t("ext.setup.stepOpen")}</strong><br />
                {links.map((url) => (
                  <a key={url} className="btn btn-pri" href={url} target="_blank" rel="noopener noreferrer">
                    {t("ext.setup.openKeys", { host: host(url) })} <span aria-hidden="true">↗</span>
                  </a>
                ))}
              </li>
              <li><strong>{t(paste ? "ext.setup.stepCopy" : "ext.setup.stepCopyOne")}</strong></li>
              <li><strong>{t("ext.setup.stepPaste")}</strong></li>
            </ol>
          )}
          {paste ? (
            <>
              <label className="field">
                {t("ext.setup.block")}
                <textarea
                  className="input mono" rows={4} spellCheck={false} autoComplete="off" disabled={busy} style={masked}
                  placeholder={names.map((n) => `${n}="…"`).join("\n")}
                  value={block} onChange={(event) => setBlock(event.target.value)}
                />
              </label>
              {examples.length > 0 && (
                <p role="alert" className="banner banner-down">{t("ext.setup.example", { names: examples.join(", ") })}</p>
              )}
              {block.trim() && (Object.keys(detected).length > 0 || examples.length === 0) && (
                <p role="status" className={Object.keys(detected).length ? "mute" : "app-note is-down"}>
                  {Object.keys(detected).length
                    ? t("ext.setup.detected", { names: Object.keys(detected).join(", ") })
                    : t("ext.setup.nothingDetected")}
                </p>
              )}
              <details>
                <summary className="mute">{t("ext.setup.oneByOne")}</summary>
                <div className="form">{fields}</div>
              </details>
            </>
          ) : fields}
          <p className="mute">{t("ext.setup.private")}</p>
          <div className="connector-actions">
            <button className="btn btn-pri" type="submit" disabled={busy || !Object.keys(send).length}>{t(busy ? "ext.setup.saving" : "ext.setup.save")}</button>
            {!missing && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setOpen(false); setBlock(""); setValues({}); }}>{t("common.cancel")}</button>}
          </div>
        </form>
      )}
    </div>
  );
}
