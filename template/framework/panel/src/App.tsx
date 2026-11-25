import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { BottomNav, SideNav, TopBar, useNavCollapsed } from "./components/Layout";
import { PanelAccessContext, pageCapability, routePage, usePanelAccess } from "./lib/access";
import { useRoute, type Route } from "./lib/router";
import { localized } from "./lib/i18n";
import { applyFavicon, applyLook } from "./lib/brand";
import { useTheme } from "./lib/theme";
import { Bots } from "./screens/Bots";
import { Connectors } from "./screens/Connectors";
import { Apps } from "./screens/Apps";
import { Observability } from "./screens/Observability";
import { ExtensionPage } from "./screens/ExtensionPage";
import { AppFrame } from "./screens/AppFrame";
import { ManagedMcp } from "./screens/ManagedMcp";
import { Mcp } from "./screens/Mcp";
import { Setup } from "./screens/Setup";
import { useStore, type Store } from "./store";

export function App() {
  const { t, i18n } = useTranslation();
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const s = useStore();
  const access = usePanelAccess(Boolean(s.mock));
  const visible = (id: string) => access.capabilities === null ||
    (access.capabilities.has("app:panel") && access.capabilities.has(pageCapability(id)));
  const [navCollapsed, toggleNav] = useNavCollapsed();
  const brand = s.project.data?.brand;
  const name = brand?.name ?? s.project.data?.name;
  // Also on every screen change: a preview an extension page showed (SDK previewLook) ends with it.
  useEffect(() => { applyLook({ accent: brand?.accent, font: brand?.font, radius: brand?.radius }); }, [brand?.accent, brand?.font, brand?.radius, route]);
  useEffect(() => { applyFavicon(brand?.icon); }, [brand?.icon]);
  // The tab names the place first, so it stays readable when tabs are narrow: "Conectores · Acme".
  const place = placeName(route, s, i18n.language, t);
  useEffect(() => {
    document.title = [place, name ?? "Fyso"].filter(Boolean).join(" · ");
  }, [place, name]);

  let screen;
  switch (route.name) {
    case "bots":
      screen = <Bots review={!!route.review} native={route.native} tab={route.tab} />;
      break;
    case "bot":
      screen = <Bots review={false} index={route.index} tab={route.tab} />;
      break;
    case "observability":
      screen = <Observability />;
      break;
    case "connectors":
      screen = <Connectors initialBotId={route.botId} />;
      break;
    case "extension":
      screen = <ExtensionPage extensionId={route.extensionId} pageId={route.pageId} theme={theme} />;
      break;
    case "mcp":
      screen = access.capabilities === null
        ? <Mcp />
        : <ManagedMcp credentialPath={access.remoteCredentialPath} />;
      break;
    case "apps":
      screen = <Apps tab={route.tab ?? "open"} />;
      break;
    case "app":
      screen = <AppFrame id={route.id} />;
      break;
    default:
      screen = <Setup />;
  }

  if (!visible(routePage(route))) {
    screen = <main className="workspace"><p role="status">{t(access.loading ? "common.loading" : "common.accessDenied")}</p></main>;
  }

  return (
    <PanelAccessContext.Provider value={access}>
      {/* Hash routing: the skip link moves focus instead of changing the hash. */}
      <a
        href="#main"
        className="sr-only skip"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        {t("common.skip")}
      </a>
      <TopBar visible={visible} theme={theme} toggleTheme={toggleTheme} route={route} navCollapsed={navCollapsed} toggleNav={toggleNav} />
      {s.project.status === "error" && (
        <div role="alert" className="banner banner-down" style={{ margin: "16px 24px 0", borderRadius: "var(--fy-radius-lg)" }}>
          <p className="grow">
            <strong style={{ color: "var(--fy-down)" }}>{t("common.loadError", { what: "project.json" })}</strong> {s.project.error}
          </p>
          <button type="button" className="btn btn-sm btn-soft" onClick={s.reload}>{t("common.retry")}</button>
        </div>
      )}
      <div className={`shell${route.name === "app" ? " shell-app" : ""}`} id="main" tabIndex={-1} style={{ outline: "none" }}>

        <SideNav showMcp={access.capabilities !== null} visible={visible} route={route} collapsed={navCollapsed} />
        {screen}
      </div>
      <BottomNav showMcp={access.capabilities !== null} visible={visible} route={route} />
    </PanelAccessContext.Provider>
  );
}

/** Where the person is, in the words the menu uses. */
function placeName(route: Route, s: Store, lang: string, t: (key: string) => string): string {
  switch (route.name) {
    case "bots": case "bot": return t("nav.bots");
    case "observability": return t("nav.observability");
    case "connectors": return t("nav.connectors");
    case "mcp": return t("mcp.title");
    case "apps": return t("nav.apps");
    case "app": {
      const app = s.apps.data?.find((item) => item.id === route.id);
      return app ? localized(lang, app.name, app.name_i18n) : t("nav.apps");
    }
    case "extension": {
      const page = s.extensions.data?.find((ext) => ext.id === route.extensionId)?.pages?.find((item) => item.id === route.pageId);
      return page ? localized(lang, page.name, page.name_i18n) : "";
    }
    default: return t("nav.setup");
  }
}
