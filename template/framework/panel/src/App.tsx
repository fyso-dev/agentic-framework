import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { BottomNav, SideNav, TopBar } from "./components/Layout";
import { useRoute } from "./lib/router";
import { useTheme } from "./lib/theme";
import { BotForm } from "./screens/BotForm";
import { Bots } from "./screens/Bots";
import { Apps } from "./screens/Apps";
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
      screen = <Bots review={!!route.review} />;
      break;
    case "bot":
      screen = <BotForm index={route.index} />;
      break;
    case "apps":
      screen = <Apps />;
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
        <div role="alert" className="banner banner-down" style={{ margin: "16px 24px 0", borderRadius: 12 }}>
          <p className="grow">
            <strong style={{ color: "var(--down)" }}>{t("common.loadError", { what: "project.json" })}</strong> {s.project.error}
          </p>
          <button type="button" className="btn btn-ghost" onClick={s.reload}>{t("common.retry")}</button>
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
