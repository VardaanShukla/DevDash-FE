import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Shared styles first, so each component's own CSS can override them.
import "./styles/theme.css";
import "./styles/ui.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
