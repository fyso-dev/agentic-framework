import { useId } from "react";
import { botAvatarColor } from "../lib/botAvatar";
import { mascotBodies } from "../lib/ombMascotBodies";

export function BotMascot({ body, color, face }: { body?: string | null; color?: string; face?: string | null }) {
  const id = useId();
  const { path, fit, anchor } = body && Object.hasOwn(mascotBodies, body) ? mascotBodies[body]! : mascotBodies.cursor!;
  const tint = botAvatarColor(color) ?? "#009957";
  const ink = face === "black" ? "#000" : face === "white" ? "#fff" : color === "chrome" ? "#1e2833" : "#fff";
  const fill = `url(#${id})`;
  return (
    <svg className="bot-mascot" viewBox="-15 -15 258.541 258.541" focusable="false">
      <defs>
        <linearGradient id={id} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`color-mix(in srgb, ${tint}, white 55%)`} />
          <stop offset="55%" stopColor={tint} />
          <stop offset="100%" stopColor={`color-mix(in srgb, ${tint}, black 42%)`} />
        </linearGradient>
      </defs>
      <path transform={fit} d={path} fill={fill} />
      <g transform={`translate(${anchor.x} ${anchor.y}) scale(${anchor.scale})`} fill={ink}>
        <rect x="-37" y="-28" width="20" height="47" rx="10" />
        <rect x="17" y="-28" width="20" height="47" rx="10" />
        <path d="M-13 30 Q0 42 13 30" fill="none" stroke={ink} strokeWidth="7" strokeLinecap="round" />
      </g>
    </svg>
  );
}
