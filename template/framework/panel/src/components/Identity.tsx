import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Brand } from "../api/types";
import { useStore } from "../store";
import { useDaguAction } from "../lib/useDaguAction";
import { base64Utf8 } from "../lib/team";
import { DEFAULT_ACCENT, FONTS, PALETTES, applyFavicon, applyLook, backgroundJpeg, iconPng, type Font, type Radius } from "../lib/brand";
import { Modal } from "./ui";
import markUrl from "../assets/brand/fyso-mark.png";

const HEX = /^#[0-9a-fA-F]{6}$/;
// framework/brand/login-background.svg in CSS: the dark surface with the accent's glow from a corner.
const drawnLogin = (accent: string) =>
  `radial-gradient(circle at 15% 0%, ${accent}e6 0%, ${accent}33 50%, transparent 90%), linear-gradient(#0e0e12, #0e0e12)`;
const FONT_IDS = Object.keys(FONTS) as Font[];
const RADIUS_IDS: Radius[] = ["sharp", "soft", "round"];

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

type Image = string | null | undefined; // undefined: keep; null: back to the default; string: new (base64)

function IdentityDialog({ brand, onClose }: { brand: Brand; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useStore();
  const action = useDaguAction<Brand>(s.backend, "fyso-brand", "RESULT");
  const [name, setName] = useState(brand.name);
  const [accent, setAccent] = useState(brand.accent);
  const [font, setFont] = useState<Font>(brand.font);
  const [radius, setRadius] = useState<Radius>(brand.radius);
  const [icon, setIcon] = useState<Image>(undefined);
  const [background, setBackground] = useState<Image>(undefined);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const saved = useRef(false);
  const shownIcon = icon === undefined ? brand.icon : icon === null ? null : `data:image/png;base64,${icon}`;
  const shownBackground = background === undefined ? brand.loginBackground : background === null ? null : `data:image/jpeg;base64,${background}`;
  const validAccent = HEX.test(accent);
  const palette = PALETTES.find((p) => p.accent === accent.toLowerCase());

  // Live preview: the whole panel takes the look and the tab the icon while the dialog is open.
  useEffect(() => { applyLook({ accent: validAccent ? accent : brand.accent, font, radius }); }, [accent, validAccent, font, radius, brand.accent]);
  useEffect(() => { applyFavicon(shownIcon); }, [shownIcon]);
  useEffect(() => () => {
    if (!saved.current) { applyLook(brand); applyFavicon(brand.icon); }
  }, [brand]);

  const busy = saving || action.phase === "running";
  const save = async () => {
    if (!name.trim()) return setError(t("identity.nameRequired"));
    if (!validAccent) return setError(t("identity.accentInvalid"));
    setSaving(true);
    const send = (input: Record<string, unknown>) => action.start({ OP: "save", SETTINGS_B64: base64Utf8(JSON.stringify(input)) });
    try {
      // Each image is saved in its own run: one workflow parameter holds at most one of them.
      if (background !== undefined && icon !== undefined && !(await send({ loginBackground: background }))) return;
      const input: Record<string, unknown> = { name: name.trim(), accent, font, radius };
      if (icon !== undefined) input.icon = icon;
      else if (background !== undefined) input.loginBackground = background;
      if (!(await send(input))) return;
      saved.current = true;
      s.reload();
      onClose();
    } finally { setSaving(false); }
  };
  const pick = async (file: File | undefined, convert: (f: File) => Promise<string>, set: (v: string) => void, fail: string) => {
    if (!file) return;
    try { set(await convert(file)); setError(undefined); }
    catch { setError(t(fail)); }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} labelledBy="identity-dialog-t" className="identity-modal">
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <div className="modal-head"><h2 id="identity-dialog-t">{t("identity.dialogTitle")}</h2></div>
        <div className="modal-body identity-form">
          <label className="field">{t("identity.name")}
            <input className="input" value={name} maxLength={40} autoFocus onChange={(e) => { setName(e.target.value); setError(undefined); }} />
            <span className="hint">{t("identity.nameHint")}</span>
          </label>

          <fieldset className="field">
            <legend>{t("identity.palette")}</legend>
            <div className="identity-palettes" role="radiogroup" aria-label={t("identity.palette")}>
              {PALETTES.map((p) => (
                <button key={p.id} type="button" role="radio" aria-checked={palette?.id === p.id} className="identity-palette"
                  onClick={() => { setAccent(p.accent); setError(undefined); }}>
                  <span className="identity-dot" style={{ background: p.accent }} aria-hidden="true" />
                  {t(`identity.palettes.${p.id}`)}
                </button>
              ))}
              <label className={`identity-palette${palette ? "" : " is-on"}`}>
                <input type="color" className="identity-color" value={validAccent ? accent : DEFAULT_ACCENT}
                  onChange={(e) => { setAccent(e.target.value); setError(undefined); }} />
                {t("identity.custom")}
              </label>
              <input className="input mono identity-hex" aria-label={t("identity.accentHex")} value={accent} maxLength={7} spellCheck={false}
                aria-invalid={!validAccent} onChange={(e) => { setAccent(e.target.value.trim()); setError(undefined); }} />
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>{t("identity.font")}</legend>
            <div className="identity-choices" role="radiogroup" aria-label={t("identity.font")}>
              {FONT_IDS.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={font === id} className="identity-choice" onClick={() => setFont(id)}
                  style={{ fontFamily: FONTS[id].display ?? FONTS[id].sans }}>
                  <span className="identity-aa" aria-hidden="true">Aa</span>
                  <span>{t(`identity.fonts.${id}`)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend>{t("identity.radius")}</legend>
            <div className="identity-choices" role="radiogroup" aria-label={t("identity.radius")}>
              {RADIUS_IDS.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={radius === id} className="identity-choice" onClick={() => setRadius(id)}>
                  <span className={`identity-corner corner-${id}`} aria-hidden="true" />
                  <span>{t(`identity.radii.${id}`)}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <span id="identity-icon-l">{t("identity.icon")}</span>
            <div className="identity-row">
              <BrandMark icon={shownIcon} size={48} />
              <label className="btn btn-sm btn-soft">
                {t("identity.iconChange")}
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" aria-describedby="identity-icon-l"
                  onChange={(e) => void pick(e.target.files?.[0], iconPng, setIcon, "identity.iconInvalid")} />
              </label>
              {shownIcon && <button type="button" className="link-btn" onClick={() => setIcon(null)}>{t("identity.iconReset")}</button>}
            </div>
            <span className="hint">{t("identity.iconHint")}</span>
          </div>

          <div className="field">
            <span id="identity-bg-l">{t("identity.background")}</span>
            <div className="identity-row">
              <div className="identity-login" style={{ backgroundImage: shownBackground ? `url("${shownBackground}")` : drawnLogin(validAccent ? accent : brand.accent) }} aria-hidden="true">
                <span className="identity-login-card"><BrandMark icon={shownIcon} size={14} /><b>{name.trim() || brand.defaults.name}</b></span>
              </div>
              <label className="btn btn-sm btn-soft">
                {t("identity.backgroundChange")}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-describedby="identity-bg-l"
                  onChange={(e) => void pick(e.target.files?.[0], backgroundJpeg, setBackground, "identity.backgroundInvalid")} />
              </label>
              {shownBackground && <button type="button" className="link-btn" onClick={() => setBackground(null)}>{t("identity.backgroundReset")}</button>}
            </div>
            <span className="hint">{t("identity.backgroundHint")}</span>
          </div>

          <p className="hint">{t("identity.restartNote")}</p>
          {(error || action.phase === "failed") && <p className="field-err" role="alert">{error ?? action.error}</p>}
        </div>
        <div className="modal-foot">
          <button type="button" className="link-btn" disabled={busy} onClick={() => {
            setName(brand.defaults.name); setAccent(brand.defaults.accent); setFont(brand.defaults.font); setRadius(brand.defaults.radius);
            setIcon(brand.icon ? null : undefined); setBackground(brand.loginBackground ? null : undefined);
          }}>{t("identity.resetAll")}</button>
          <span className="grow" />
          <button type="button" className="btn btn-soft" onClick={onClose} disabled={busy}>{t("identity.cancel")}</button>
          <button type="submit" className="btn btn-pri" disabled={busy}>{busy ? t("identity.saving") : t("identity.save")}</button>
        </div>
      </form>
    </Modal>
  );
}
