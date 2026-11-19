import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Brand } from "../api/types";
import { useStore } from "../store";
import { useDaguAction } from "../lib/useDaguAction";
import { base64Utf8 } from "../lib/team";
import { DEFAULT_ACCENT, applyAccent, applyFavicon, iconPng } from "../lib/brand";
import { Modal } from "./ui";
import markUrl from "../assets/brand/fyso-mark.png";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The project's mark: its own icon, or the Fyso mark. */
export function BrandMark({ icon, size = 28 }: { icon: string | null | undefined; size?: number }) {
  return <img className="brand-mark" src={icon ?? markUrl} alt="" width={size} height={size} />;
}

/** Setup card (D92): the identity every app shows, and the way to change it. */
export function IdentityCard() {
  const { t } = useTranslation();
  const s = useStore();
  const brand = s.project.data?.brand;
  const [editing, setEditing] = useState(false);
  if (!brand) return null;
  return (
    <section className="card as-setup" aria-labelledby="identity-t">
      <BrandMark icon={brand.icon} size={40} />
      <div className="grow">
        <h2 id="identity-t">{t("identity.title")}</h2>
        <p className="mute">
          <span className="identity-swatch" style={{ background: brand.accent }} aria-hidden="true" /> {brand.name} · {t("identity.body")}
        </p>
      </div>
      <button type="button" className="btn btn-sm btn-soft" onClick={() => setEditing(true)}>{t("identity.edit")}</button>
      {editing && <IdentityDialog brand={brand} onClose={() => setEditing(false)} />}
    </section>
  );
}

function IdentityDialog({ brand, onClose }: { brand: Brand; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useStore();
  const action = useDaguAction<Brand>(s.backend, "fyso-brand", "RESULT");
  const [name, setName] = useState(brand.name);
  const [accent, setAccent] = useState(brand.accent);
  // undefined: keep the current icon; null: back to the Fyso mark; string: a new PNG (base64).
  const [icon, setIcon] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string>();
  const saved = useRef(false);
  const shownIcon = icon === undefined ? brand.icon : icon === null ? null : `data:image/png;base64,${icon}`;
  const validAccent = HEX.test(accent);

  // Live preview: the whole panel takes the accent and the tab the icon while the dialog is open.
  useEffect(() => { if (validAccent) applyAccent(accent); }, [accent, validAccent]);
  useEffect(() => { applyFavicon(shownIcon); }, [shownIcon]);
  useEffect(() => () => {
    if (!saved.current) { applyAccent(brand.accent); applyFavicon(brand.icon); }
  }, [brand]);

  const busy = action.phase === "running";
  const save = async () => {
    if (!name.trim()) return setError(t("identity.nameRequired"));
    if (!validAccent) return setError(t("identity.accentInvalid"));
    const input: Record<string, unknown> = { name: name.trim(), accent };
    if (icon !== undefined) input.icon = icon;
    const result = await action.start({ OP: "save", SETTINGS_B64: base64Utf8(JSON.stringify(input)) });
    if (!result) return;
    saved.current = true;
    s.reload();
    onClose();
  };
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try { setIcon(await iconPng(file)); setError(undefined); }
    catch { setError(t("identity.iconInvalid")); }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} labelledBy="identity-dialog-t">
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="modal-head"><h2 id="identity-dialog-t">{t("identity.dialogTitle")}</h2></div>
        <div className="modal-body identity-form">
          <label className="field">{t("identity.name")}
            <input className="input" value={name} maxLength={40} autoFocus onChange={(e) => { setName(e.target.value); setError(undefined); }} />
            <span className="hint">{t("identity.nameHint")}</span>
          </label>
          <div className="field">
            <span id="identity-accent-l">{t("identity.accent")}</span>
            <div className="identity-row">
              <input type="color" className="identity-color" aria-labelledby="identity-accent-l" value={validAccent ? accent : DEFAULT_ACCENT}
                onChange={(e) => { setAccent(e.target.value); setError(undefined); }} />
              <input className="input mono identity-hex" aria-label={t("identity.accentHex")} value={accent} maxLength={7} spellCheck={false}
                aria-invalid={!validAccent} onChange={(e) => { setAccent(e.target.value.trim()); setError(undefined); }} />
              {accent.toLowerCase() !== brand.defaults.accent && (
                <button type="button" className="link-btn" onClick={() => setAccent(brand.defaults.accent)}>{t("identity.reset")}</button>
              )}
            </div>
          </div>
          <div className="field">
            <span id="identity-icon-l">{t("identity.icon")}</span>
            <div className="identity-row">
              <BrandMark icon={shownIcon} size={48} />
              <label className="btn btn-sm btn-soft">
                {t("identity.iconChange")}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-describedby="identity-icon-l"
                  onChange={(e) => void pick(e.target.files?.[0])} />
              </label>
              {shownIcon && <button type="button" className="link-btn" onClick={() => setIcon(null)}>{t("identity.iconReset")}</button>}
            </div>
            <span className="hint">{t("identity.iconHint")}</span>
          </div>
          <div className="identity-preview" aria-hidden="true">
            <BrandMark icon={shownIcon} size={22} />
            <strong>{name.trim() || brand.defaults.name}</strong>
            <span className="grow" />
            <span className="btn btn-sm btn-pri">{t("identity.sample")}</span>
          </div>
          <p className="hint">{t("identity.restartNote")}</p>
          {(error || action.phase === "failed") && <p className="field-err" role="alert">{error ?? action.error}</p>}
        </div>
        <div className="modal-foot">
          <span className="grow" />
          <button type="button" className="btn btn-soft" onClick={onClose} disabled={busy}>{t("identity.cancel")}</button>
          <button type="submit" className="btn btn-pri" disabled={busy}>{busy ? t("identity.saving") : t("identity.save")}</button>
        </div>
      </form>
    </Modal>
  );
}
