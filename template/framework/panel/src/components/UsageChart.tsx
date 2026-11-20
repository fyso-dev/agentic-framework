// Daily stacked bars drawn by uPlot (D84). Colors come from the --fy-chart-* tokens so both themes stay legible.
import { useEffect, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

export type ChartSeries = { label: string; token: string; values: (number | null)[] };

type Props = {
  days: string[];
  series: ChartSeries[];
  label: string;
  format: (value: number | null) => string;
  formatDay: (day: string) => string;
  axis: (value: number) => string;
};

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

/** The theme class on <html>, so colors are re-read when the person toggles light/dark. */
function useThemeClass() {
  const [theme, setTheme] = useState(() => document.documentElement.className);
  useEffect(() => {
    const watch = new MutationObserver(() => setTheme(document.documentElement.className));
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => watch.disconnect();
  }, []);
  return theme;
}

export function UsageChart({ days, series, label, format, formatDay, axis }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const theme = useThemeClass();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const xs = days.map(d => Date.parse(`${d}T00:00:00Z`) / 1000);
    // Stack: series i is drawn as the running total of 0..i, the tallest first so lower layers paint over it.
    const stacked: number[][] = [];
    series.forEach((s, i) => stacked.push(s.values.map((v, j) => (v ?? 0) + (i ? stacked[i - 1][j] : 0))));
    const order = series.map((_, i) => i).reverse();
    const bars = uPlot.paths.bars!({ size: [0.7, 48], align: 0 });
    const plot = new uPlot({
      width: el.clientWidth || 600,
      height: 240,
      legend: { show: false },
      cursor: { y: false, points: { show: false }, drag: { x: false, y: false } },
      scales: { x: { time: false, range: (_u, min, max) => [min - 43200, max + 43200] }, y: { range: (_u, _min, max) => [0, max > 0 ? max * 1.1 : 1] } },
      axes: [
        { stroke: css("--fy-mute"), grid: { show: false }, ticks: { show: false }, values: (_u, ticks) => ticks.map(t => formatDay(new Date(t * 1000).toISOString().slice(0, 10))), space: 48 },
        { stroke: css("--fy-mute"), grid: { stroke: css("--fy-line") }, ticks: { show: false }, values: (_u, ticks) => ticks.map(axis), size: 64 },
      ],
      series: [{}, ...order.map(i => ({ label: series[i].label, fill: css(series[i].token), stroke: css(series[i].token), width: 0, paths: bars, points: { show: false } }))],
      hooks: { setCursor: [u => setHover(u.cursor.idx ?? null)] },
    }, [xs, ...order.map(i => stacked[i])] as uPlot.AlignedData, el);
    const resize = new ResizeObserver(() => plot.setSize({ width: el.clientWidth, height: 240 }));
    resize.observe(el);
    return () => { resize.disconnect(); plot.destroy(); };
  }, [days, series, formatDay, axis, theme]);
  const at = hover ?? days.length - 1;
  return <figure className="usage-chart">
    <div ref={box} role="img" aria-label={label} onMouseLeave={() => setHover(null)} />
    <figcaption className="usage-legend">
      {at >= 0 && <strong>{formatDay(days[at])}</strong>}
      {series.map(s => <span key={s.label}><i style={{ background: `var(${s.token})` }} />{s.label}: {at >= 0 ? format(s.values[at]) : format(null)}</span>)}
    </figcaption>
  </figure>;
}
