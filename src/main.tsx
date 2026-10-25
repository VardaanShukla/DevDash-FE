import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Poppins ships with the page (Latin only), so the dashboard needs no font server. 200 and
// 300 are the splash's wordmark, 800 the logo and badges; a browser only fetches a weight
// when something on screen uses it.
import "@fontsource/poppins/latin-200.css";
import "@fontsource/poppins/latin-300.css";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-800.css";
// Tailwind first, then shared styles, so each component's own CSS can override them.
import "./index.css";
import "./styles/theme.css";
import "./styles/ui.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
