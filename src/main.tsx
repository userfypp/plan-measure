import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { preloadWhenIdle } from "./app/idlePreload";
import { installOverlayScrollbars } from "./app/overlayScrollbars";
import { installScrollHover } from "./app/scrollHover";
import { ThemeProvider } from "./app/themeState";
import { installClickFocus } from "./utils/clickFocus";
import { installInputModality } from "./utils/inputModality";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element was not found.");
}

installOverlayScrollbars();
installScrollHover();
installInputModality();
installClickFocus();

if (import.meta.env.PROD) {
  window.addEventListener("load", () =>
    preloadWhenIdle([
      () =>
        import("./app/serviceWorkerRegistration").then((module) => module.registerServiceWorker()),
    ]),
  );
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
