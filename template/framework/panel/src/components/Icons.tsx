// Line icons from the design boards (24×24, stroke = currentColor).
import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, strokeWidth = 1.75, ...rest }: P & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconChecklist = (p: P) => (
  <Svg {...p}>
    <path d="M10 6h11M10 12h11M10 18h11" />
    <path d="M3 6l1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
  </Svg>
);

export const IconBot = (p: P) => (
  <Svg {...p}>
    <path d="M12 8V4H8" />
    <rect x="4" y="8" width="16" height="12" rx="2" />
    <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
  </Svg>
);

export const IconApps = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

export const IconWorkflow = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <path d="M7 11v4a2 2 0 0 0 2 2h4" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
  </Svg>
);

export const IconUsers = (p: P) => (
  <Svg {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

export const IconTruck = (p: P) => (
  <Svg {...p}>
    <path d="M1 4h13v12H1z" />
    <path d="M14 9h4l3 3v4h-7" />
    <circle cx="5.5" cy="18.5" r="2" />
    <circle cx="17.5" cy="18.5" r="2" />
  </Svg>
);

export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </Svg>
);

export const IconPlus = (p: P) => (
  <Svg strokeWidth={2.25} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const IconMoon = (p: P) => (
  <Svg {...p}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </Svg>
);

export const IconCommit = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M3 12h6M15 12h6" />
  </Svg>
);

export const Spinner = ({ size = 12 }: { size?: number }) => (
  <Svg size={size} strokeWidth={2.5} className="fy-spin">
    <path d="M21 12a9 9 0 1 1-6.2-8.6" />
  </Svg>
);

/** Generic app icon names from the contract (`App.icon`). */
export function AppIcon({ name, size }: { name: string; size?: number }) {
  switch (name) {
    case "workflow":
      return <IconWorkflow size={size} />;
    case "bot":
      return <IconBot size={size} />;
    case "users":
      return <IconUsers size={size} />;
    case "truck":
      return <IconTruck size={size} />;
    case "chart":
      return <IconChart size={size} />;
    case "puzzle":
      return <IconPuzzle size={size} />;
    default:
      return <IconApps size={size} />;
  }
}

// Bot detail (B1.3): one stroke weight, one size per context.
const icon = (d: string) => (p: P) => <Svg {...p}><path d={d} /></Svg>;
export const IconChat = icon("M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5z");
export const IconTrash = icon("M5 7h14M10 11v5M14 11v5M7 7l.8 11.2a2 2 0 0 0 2 1.8h4.4a2 2 0 0 0 2-1.8L17 7M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7");
export const IconPerson = icon("M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 19.5a7 7 0 0 1 14 0");
export const IconDoc = icon("M8 4h6l4 4v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM14 4v4h4M9.5 13h5M9.5 16.5h3.5");
export const IconPlug = icon("M9 7V4M15 7V4M7 7h10v4a5 5 0 0 1-10 0zM12 16v4");
export const IconWrench = icon("M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z");
export const IconAlert = icon("M12 4.5l8.5 15h-17zM12 10.5v3.5M12 16.8v.2");
export const IconTrend = icon("M4 17l5-5 4 4 7-8M14 8h6v6");
export const IconSparkle = icon("M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6-4.6-1.9 4.6-1.9zM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z");
export const IconShield = icon("M12 3.5l7 2.7v5.3c0 4.4-3 7.3-7 8.5-4-1.2-7-4.1-7-8.5V6.2z");
export const IconShieldCheck = icon("M12 3.5l7 2.7v5.3c0 4.4-3 7.3-7 8.5-4-1.2-7-4.1-7-8.5V6.2zM9 12l2 2 4-4");
export const IconHand = icon("M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V5a1.5 1.5 0 0 1 3 0v6M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a5.5 5.5 0 0 1-4.4-2.2L4 15a1.5 1.5 0 0 1 2.3-1.9L8 15");
export const IconBolt = icon("M13 3L5 13.5h6L10 21l8-10.5h-6z");
export const IconEye = (p: P) => <Svg {...p}><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.5" /></Svg>;
export const IconPencil = icon("M5 19h3.5L18.5 9a2.1 2.1 0 0 0-3-3L5.5 16zM14 7.5l2.5 2.5");
export const IconClose = icon("M7 7l10 10M17 7L7 17");
export const IconUndo = icon("M9 14L4.5 9.5 9 5M4.5 9.5H15a4.5 4.5 0 0 1 0 9h-3");
export const IconBulb = icon("M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z");
export const IconPlay = (p: P) => <Svg {...p}><path d="M8 5.5v13l10-6.5z" fill="currentColor" /></Svg>;
export const IconLayers = icon("M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4");
export const IconArrowUpRight = icon("M7 17L17 7M9 7h8v8");
export const IconCode = icon("M8 8l-4 4 4 4M16 8l4 4-4 4");
export const IconFlow = (p: P) => <Svg {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5" /></Svg>;
export const IconBack = icon("M15 5l-7 7 7 7");
export const IconInfo = icon("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.8v.2");

// Apps (launcher + extensions).
export const IconPuzzle = icon("M10 4h4v3a2 2 0 1 0 4 0V4h2v6h-3a2 2 0 1 0 0 4h3v6h-6v-3a2 2 0 1 0-4 0v3H4v-6h3a2 2 0 1 0 0-4H4V4z");
export const IconRefresh = icon("M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6");
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>;
export const IconLockOpen = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></Svg>;
export const IconDownload = icon("M12 4v12M7 11l5 5 5-5M5 20h14");
export const IconTerminal = icon("M5 7l5 5-5 5M12 17h7");
export const IconExternal = icon("M10 14L20 4M14 4h6v6M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5");
export const IconCheck = icon("M5 12l5 5L20 7");
