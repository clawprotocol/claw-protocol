import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import { ClawProductApp } from "./ClawProductApp";
import { ApiReachabilityBanner } from "./launch/ApiReachabilityBanner";
import { LaunchNavProvider } from "./launch/LaunchNavContext";
import { AccessProvider } from "./access/AccessContext";
import { AuthProvider } from "./auth/AuthProvider";
import { warnIfProductionMissingPrivacyInbox } from "./launch/legal/privacyInboxDeployGuard";
import { initLawdogLocalhostDevGating } from "./launch/lawdogLocalDevGating";
import { isProductionApiMisconfigured } from "./lib/clawApi";
import { startApiReachabilityPolling } from "./lib/apiReachability";
import { logFrontendBuildIdentity } from "./lib/frontendBuildIdentity";
// Legacy full app (e‑sign, timelines, etc.): import App from "./App"; then <App />

warnIfProductionMissingPrivacyInbox();
initLawdogLocalhostDevGating();
if (isProductionApiMisconfigured()) {
  console.warn(
    "[LawDog] Production build targets a loopback API URL. Set VITE_CLAW_API_BASE to your hosted API.",
  );
}
startApiReachabilityPolling();
logFrontendBuildIdentity();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <LaunchNavProvider>
      <AuthProvider>
        <AccessProvider>
          <ApiReachabilityBanner />
          <ClawProductApp />
        </AccessProvider>
      </AuthProvider>
    </LaunchNavProvider>
  </React.StrictMode>
);
