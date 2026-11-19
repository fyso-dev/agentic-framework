// Project identity in the panel (D92): the accent recolours the design-system tokens and the
// project's icon replaces the Fyso mark in the top bar and the favicon.
export const DEFAULT_ACCENT = "#6e1fff";

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

/** Applies an accent to the whole panel; also used for the live preview while editing. */
export function applyAccent(accent: string | undefined) {
  let style = document.getElementById("fy-brand") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "fy-brand";
    document.head.appendChild(style);
  }
  style.textContent = accent ? accentCss(accent) : "";
}

let defaultFavicon: string | null = null;
/** The tab icon: the project's own, or the Fyso mark the page ships with. */
export function applyFavicon(icon: string | null | undefined) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  defaultFavicon ??= link.href;
  link.href = icon ?? defaultFavicon;
}

/** Any image the browser can open, as a square PNG of at most 256 px (base64, no prefix). */
export async function iconPng(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const size = Math.min(256, Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const scale = size / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    canvas.getContext("2d")!.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/png").split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}
