import { useTranslation } from "react-i18next";
import { useStore } from "../store";
import { localized } from "../lib/i18n";

/**
 * An app that declares `embed: true` (D92) opens here, inside the panel frame, so the project
 * keeps one identity: the panel's top bar (with the app's name and a way out) and its
 * navigation, collapsible to icons, around the app's own interface.
 * The gateway lets only the panel frame these apps (frame-ancestors).
 */
export function AppFrame({ id }: Readonly<{ id: string }>) {
  const { t, i18n } = useTranslation();
  const { apps } = useStore();
  if (apps.status === "loading") return <main className="page"><output>{t("extensionPage.loading")}</output></main>;
  const app = apps.data?.find((item) => item.id === id && item.enabled && item.embed);
  let url: URL | null = null;
  try { url = app ? new URL(app.url) : null; } catch { url = null; }
  if (!app || !url || !/^https?:$/.test(url.protocol)) {
    return <main className="page"><p role="alert">{t("extensionPage.missing")}</p></main>;
  }
  const name = localized(i18n.language, app.name, app.name_i18n);
  return (
    <main className="app-page">
      <iframe className="app-frame" title={name} src={url.href} allow="clipboard-read; clipboard-write; microphone" />
    </main>
  );
}
