import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { installOverlayScrollbars } from "./app/overlayScrollbars";
import { installScrollHover } from "./app/scrollHover";
import { ThemeProvider } from "./app/themeState";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element was not found.");
}

installOverlayScrollbars();
installScrollHover();

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
