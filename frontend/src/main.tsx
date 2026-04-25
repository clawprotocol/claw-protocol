import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { ClawProductApp } from "./ClawProductApp";
import { LaunchNavProvider } from "./launch/LaunchNavContext";
import { warnIfProductionMissingPrivacyInbox } from "./launch/legal/privacyInboxDeployGuard";
import { initLawdogLocalhostDevGating } from "./launch/lawdogLocalDevGating";
// Legacy full app (e‑sign, timelines, etc.): import App from "./App"; then <App />

warnIfProductionMissingPrivacyInbox();
initLawdogLocalhostDevGating();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LaunchNavProvider>
      <ClawProductApp />
    </LaunchNavProvider>
  </React.StrictMode>
);
