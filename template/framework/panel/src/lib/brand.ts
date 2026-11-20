// Project identity in the panel (D92): the accent, the type and the corners become the
// design-system tokens, and the project's icon replaces the Fyso mark in the top bar and favicon.
// The panel only applies it; an extension may offer an editor (SDK v3: applyLook, previewLook).
export const DEFAULT_ACCENT = "#6e1fff";

export type Font = "fyso" | "system" | "humanist" | "classic" | "rounded";
export type Radius = "sharp" | "soft" | "round";
export type Look = { accent?: string; font?: Font; radius?: Radius };

// System font stacks: nothing to download, each platform uses the closest font it has.
const SYSTEM = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const FONTS: Record<Font, { sans?: string; display?: string }> = {
  fyso: {},
  system: { sans: SYSTEM, display: SYSTEM },
  humanist: { sans: 'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif' },
  classic: { sans: SYSTEM, display: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif' },
  rounded: { sans: 'ui-rounded, "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", Calibri, source-sans-pro, sans-serif' },
};

const RADII: Record<Radius, Record<string, string> | null> = {
  soft: null,
  sharp: { sm: "2px", md: "3px", box: "4px", lg: "4px", xl: "6px", pill: "6px" },
  round: { sm: "8px", md: "12px", box: "14px", lg: "18px", xl: "24px", pill: "999px" },
};

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** The accent tokens for both themes, derived from one colour; empty for the default violet. */
export function accentCss(accent: string): string {
  const a = accent.toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(a) || a === DEFAULT_ACCENT) return "";
  // Text on the accent: dark on light colours, so a yellow button stays readable.
  const on = luminance(a) > 0.4 ? "#14131a" : "#ffffff";
  const mix = (pct: number, other: string) => `color-mix(in srgb, ${a} ${pct}%, ${other})`;
  return `.fy-light{--fy-accent:${a};--fy-accent-hover:${mix(82, "#000")};--fy-accent-text:${mix(80, "#000")};--fy-accent-soft:${mix(18, "#fff")};--fy-on-accent:${on};--fy-on-accent-soft:${mix(65, "#000")};--fy-focus:${a};--fy-chart-1:${a}}
.fy-dark{--fy-accent:${a};--fy-accent-hover:${mix(78, "#fff")};--fy-accent-text:${mix(45, "#fff")};--fy-accent-soft:${mix(30, "transparent")};--fy-on-accent:${on};--fy-on-accent-soft:${mix(30, "#fff")};--fy-focus:${a};--fy-chart-1:${a}}`;
}

export function lookCss({ accent, font, radius }: Look): string {
  const vars: string[] = [];
  const f = font ? FONTS[font] : undefined;
  if (f?.sans) vars.push(`--font-sans:${f.sans}`);
  if (f?.display ?? f?.sans) vars.push(`--font-display:${f.display ?? f.sans}`);
  const r = radius ? RADII[radius] : null;
  if (r) for (const [k, v] of Object.entries(r)) vars.push(`--fy-radius-${k}:${v}`);
  return `${accent ? accentCss(accent) : ""}${vars.length ? `\n:root{${vars.join(";")}}` : ""}`;
}

/** Applies a look to a document of the panel (the panel itself or an extension page). */
export function applyLook(look: Look, doc: Document = document) {
  let style = doc.getElementById("fy-brand") as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement("style");
    style.id = "fy-brand";
    doc.head.appendChild(style);
  }
  style.textContent = lookCss(look);
}

let defaultFavicon: string | null = null;
/** The tab icon: the project's own, or the Fyso mark the page ships with. */
export function applyFavicon(icon: string | null | undefined) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  defaultFavicon ??= link.href;
  link.href = icon ?? defaultFavicon;
}
