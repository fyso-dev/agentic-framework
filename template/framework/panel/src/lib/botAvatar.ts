// OpenMausBot's native profile accepts only its own stored raster attachments.
export function botAvatarSrc(omb: string | undefined, avatar: string | null | undefined): string | undefined {
  if (!omb || !avatar || !/^\/api\/attachments\/[A-Za-z0-9-]+\.(?:png|jpg|gif|webp)$/.test(avatar)) return;
  return new URL(avatar, omb).href;
}

const colors: Record<string, string> = {
  green: "#009957", blue: "#377FE6", red: "#D94B52", orange: "#E78531",
  purple: "#8057C8", cyan: "#0EA5C6", pink: "#D84F8B", yellow: "#D8A729",
  teal: "#01A492", coral: "#E5634E", silver: "#A8ADB4", chrome: "#B3BAC4",
};

export function botAvatarColor(color?: string): string | undefined {
  return color && Object.hasOwn(colors, color) ? colors[color] : undefined;
}
