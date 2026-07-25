import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans-jp";
import { App } from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("画面を表示するためのルート要素が見つかりません。");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
