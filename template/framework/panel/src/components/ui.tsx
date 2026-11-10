import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useNow, useTimeFormat } from "../lib/time";
import { botAvatarSrc } from "../lib/botAvatar";
import type { BotAppearance } from "../api/types";
import { BotMascot } from "./BotMascot";

/** A link that opens in a new tab, with the ↗ glyph and a hidden hint for screen readers. */
export function External({ href, className, children, arrow = true }: { href: string; className?: string; children: ReactNode; arrow?: boolean }) {
  const { t } = useTranslation();
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
      {arrow && <span aria-hidden="true">↗</span>}
      <span className="sr-only"> {t("common.newTab")}</span>
    </a>
  );
}

/** Relative time with the exact date on hover. */
export function RelTime({ at, prefix }: { at?: string | number; prefix?: (rel: string) => string }) {
  const now = useNow();
  const f = useTimeFormat();
  if (at === undefined) return null;
  const rel = f.relative(at, now);
  const iso = new Date(at).toISOString();
  return (
    <time dateTime={iso} title={f.exact(at)}>
      {prefix ? prefix(rel) : rel}
    </time>
  );
}

export function CopyLine({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      /* clipboard blocked (http on a non-localhost host): the text stays selectable */
    }
  };
  return (
    <div className="copyline">
      <code>{text}</code>
      <button type="button" className="btn btn-sm" onClick={copy} aria-live="polite">
        {copied ? t("common.copied") : t("common.copy")}
      </button>
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, describedBy }: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
    >
      <span />
    </button>
  );
}

/** Native modal dialog: focus trap, Esc and backdrop come from the browser. */
export function Modal({ open, onClose, labelledBy, className = "", role, children }: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  role?: "alertdialog";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // Start focus on the dialog itself; Tab moves into its controls.
      d.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      tabIndex={-1}


      className={`modal ${className}`}
      aria-labelledby={labelledBy}
      role={role}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [...words[0]!].slice(0, 2) : words.slice(0, 2).map((w) => [...w][0]!);
  return letters.join("").toUpperCase();
}


export function Avatar({ name, large, omb, appearance }: {
  name: string; large?: boolean; omb?: string; appearance?: BotAppearance;
}) {
  const [failedSrc, setFailedSrc] = useState<string>();
  const src = botAvatarSrc(omb, appearance?.avatarUrl);
  const crop = appearance?.avatarCrop;
  const image = src && src !== failedSrc && crop !== "mascot";
  const position = `${100 * (appearance?.avatarFocusX ?? 0.5)}% ${100 * (appearance?.avatarFocusY ?? 0.5)}%`;
  const radius = crop === "circle" ? "50%" : crop === "rounded" ? "22%" : crop === "square" ? "0" : undefined;
  return (
    <span aria-hidden="true" className={`avatar${large ? " avatar-lg" : ""}${appearance && !image ? " avatar-mascot" : ""}`}
      style={image ? { borderRadius: radius } : undefined}>
      {image ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)}
        style={{ objectPosition: position, transformOrigin: position, transform: `scale(${appearance?.avatarZoom ?? 1})` }} />
        : appearance ? <BotMascot body={appearance.mascotBody} color={appearance.color} face={appearance.mascotFaceColor} />
          : initials(name)}
    </span>
  );
}
