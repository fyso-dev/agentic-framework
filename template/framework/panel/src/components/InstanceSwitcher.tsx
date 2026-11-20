import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../store";
import { switcherItems, switcherRequest, type SwitcherItem } from "../lib/instanceSwitcher";

/**
 * Menu beside the brand that jumps to another instance (D94). It appears only when an
 * installed extension declares a switcher and its list answers with at least one other
 * instance; any failure leaves the top bar as it was.
 */
export function InstanceSwitcher() {
  const { t } = useTranslation();
  const s = useStore();
  const source = s.mock ? undefined : (s.extensions.data ?? []).find((ext) => ext.switcher)?.switcher?.url;
  const [items, setItems] = useState<SwitcherItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!source) { setItems([]); return; }
    const controller = new AbortController();
    const here = window.location.href;
    let request: ReturnType<typeof switcherRequest>;
    try { request = switcherRequest(source, here); } catch { return; }
    fetch(request.url, { credentials: request.credentials, cache: "no-store", signal: controller.signal, headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!controller.signal.aborted) setItems(switcherItems(data, here)); })
      .catch(() => { if (!controller.signal.aborted) setItems([]); });
    return () => controller.abort();
  }, [source]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!items.some((item) => !item.current)) return null;
  return (
    <div ref={ref} className="switcher">
      <button type="button" className="icon-btn switcher-btn" aria-haspopup="true" aria-expanded={open}
        aria-label={t("top.switchInstance")} title={t("top.switchInstance")} onClick={() => setOpen(!open)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 10l5 5 5-5" />
        </svg>
      </button>
      {open && (
        <nav className="menu switcher-menu" aria-label={t("top.instances")}>
          <span className="label">{t("top.instances")}</span>
          <ul>
            {items.map((item) => (
              <li key={item.url}>
                <a href={item.url} aria-current={item.current ? "page" : undefined}>
                  <span className="grow">{item.name}</span>
                  {item.current && <span aria-hidden="true">✓</span>}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
