import "./fonts.css";
import React from "react";
import ReactDOM from "react-dom/client";
import "@/lib/i18n";
import { App } from "@/App";
import "@/index.css";
import "@/reading-fixes.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
