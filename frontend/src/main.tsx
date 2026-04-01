import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { Vs01Layout } from "./vs01/Vs01Layout";
import { Vs01Wizard } from "./vs01/Vs01Wizard";
// Legacy full app (e‑sign, timelines, etc.): import App from "./App"; then <App />

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Vs01Layout>
      <Vs01Wizard />
    </Vs01Layout>
  </React.StrictMode>
);
