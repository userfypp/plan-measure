import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { ThemeProvider } from "./app/themeState";
import { publishScrollbarSize } from "./utils/scrollbarSize";
import "./styles/global.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Application root element was not found.");
}

publishScrollbarSize();

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
