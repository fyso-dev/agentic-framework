// Relative times with Intl.RelativeTimeFormat ("hace 12 min"), exact date on hover.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** Re-render every `ms` so relative times stay current. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function useTimeFormat() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const style = t("time.style") as Intl.RelativeTimeFormatStyle;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "always", style });
  const full = new Intl.DateTimeFormat(lang, { dateStyle: "full", timeStyle: "medium" });
  const secs = new Intl.NumberFormat(lang, { style: "unit", unit: "second", unitDisplay: "short"
 });
  return {
    relative(iso: string | number | undefined, now = Date.now()): string {
      if (iso === undefined) return "";
      const ms = typeof iso === "number" ? iso : Date.parse(iso);
      if (Number.isNaN(ms)) return "";
      const diff = Math.round((ms - now) / 1000);
      if (Math.abs(diff) < 45) return t("time.justNow");
      for (const [unit, size] of UNITS) {
        if (Math.abs(diff) >= size) return rtf.format(Math.round(diff / size), unit);
      }
      return rtf.format(Math.round(diff / 60) || -1, "minute");
    },
    exact(iso: string | number | undefined): string {
      if (iso === undefined) return "";
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? "" : full.format(d);
    },
    seconds: (n: number) => secs.format(Math.max(0, Math.round(n))),
  };
}
