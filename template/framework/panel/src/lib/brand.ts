// Project identity in the panel (D92): the accent, the type and the corners become the
// design-system tokens, and the project's icon replaces the Fyso mark in the top bar and favicon.
export const DEFAULT_ACCENT = "#6e1fff";

export type Font = "fyso" | "system" | "humanist" | "classic" | "rounded";
export type Radius = "sharp" | "soft" | "round";
export type Look = { accent?: string; font?: Font; radius?: Radius };

/** Curated accents; any other colour is the custom one. */
export const PALETTES: { id: string; accent: string }[] = [
  { id: "fyso", accent: "#6e1fff" },
  { id: "ocean", accent: "#0b6bcb" },
  { id: "teal", accent: "#0e9384" },
  { id: "forest", accent: "#2f855a" },
  { id: "gold", accent: "#c99700" },
  { id: "sunset", accent: "#e8590c" },
  { id: "ruby", accent: "#c81e4f" },
  { id: "graphite", accent: "#3f3f46" },
];

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

/** Applies a look to the whole panel; also used for the live preview while editing. */
export function applyLook(look: Look) {
  let style = document.getElementById("fy-brand") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "fy-brand";
    document.head.appendChild(style);
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

async function load(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Images travel base64 in a workflow parameter (Linux caps one value at 128 KB): stay below 88 KB.
const MAX_BYTES = 88 * 1024;
const bytes = (base64: string) => Math.floor((base64.length * 3) / 4);

/** Any image the browser can open, as a square PNG (base64, no prefix), small enough to save. */
export async function iconPng(file: File): Promise<string> {
  const img = await load(file);
  for (const max of [256, 192, 128, 96]) {
    const size = Math.min(max, Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const scale = size / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    canvas.getContext("2d")!.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const data = canvas.toDataURL("image/png").split(",")[1];
    if (bytes(data) <= MAX_BYTES) return data;
  }
  throw new Error("icon too large");
}

/** A photo for the login background, as a JPEG (base64, no prefix), small enough to save. */
export async function backgroundJpeg(file: File): Promise<string> {
  const img = await load(file);
  for (const max of [1600, 1280, 1024]) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#0e0e12"; // transparent images get the login's dark base
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58, 0.46]) {
      const data = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      if (bytes(data) <= MAX_BYTES) return data;
    }
  }
  throw new Error("background too large");
}
