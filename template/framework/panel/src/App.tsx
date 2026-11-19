import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { BottomNav, SideNav, TopBar } from "./components/Layout";
import { useRoute } from "./lib/router";
import { useTheme } from "./lib/theme";
import { Bots } from "./screens/Bots";
import { Connectors } from "./screens/Connectors";
import { Apps } from "./screens/Apps";
import { Observability } from "./screens/Observability";
import { ExtensionPage } from "./screens/ExtensionPage";
import { AppFrame } from "./screens/AppFrame";
import { Mcp } from "./screens/Mcp";
import { Setup } from "./screens/Setup";
import { useStore } from "./store";

export function App() {
  const { t } = useTranslation();
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const s = useStore();
  const name = s.project.data?.name;
  useEffect(() => {
    document.title = name ? `${name} · Fyso` : "Fyso";
  }, [name]);

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
      screen = <Mcp />;
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

  return (
    <>
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
      <TopBar theme={theme} toggleTheme={toggleTheme} />
      {s.project.status === "error" && (
        <div role="alert" className="banner banner-down" style={{ margin: "16px 24px 0", borderRadius: "var(--fy-radius-lg)" }}>
          <p className="grow">
            <strong style={{ color: "var(--fy-down)" }}>{t("common.loadError", { what: "project.json" })}</strong> {s.project.error}
          </p>
          <button type="button" className="btn btn-sm btn-soft" onClick={s.reload}>{t("common.retry")}</button>
        </div>
      )}
      <div className="shell" id="main" tabIndex={-1} style={{ outline: "none" }}>

        <SideNav route={route} />
        {screen}
      </div>
      <BottomNav route={route} />
    </>
  );
}
