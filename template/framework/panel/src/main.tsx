import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
import "./lib/i18n";
import { loadBackend } from "./api";
import { App } from "./App";
import { StoreProvider } from "./store";

void loadBackend().then((loaded) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <StoreProvider loaded={loaded}>
        <App />
      </StoreProvider>
    </StrictMode>,
  );
});

