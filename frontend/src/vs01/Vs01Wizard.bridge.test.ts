import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vs01Wizard agreement bridge (static)", () => {
  it("handles agreement_bridge query and session handoff", () => {
    const p = join(__dirname, "Vs01Wizard.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("[vs01-bridge-hydrate]");
    expect(s).toContain("[vs01-route-mounted]");
    expect(s).toContain("agreement_bridge");
    expect(s).toContain("readAgreementVs01BridgeSession");
    expect(s).toContain("goToStep(2)");
    expect(s).toContain("seedAwaitingContentSha");
    expect(s).toContain("showVs01DocumentsRail");
    expect(s).toContain("[vs01-paid-pro-skip-details]");
    expect(s).toContain("paidProAgreementBridgeSkip");
    expect(s).toContain("computePaidProAgreementBridgeSkip");
    expect(s).toContain("writePaidProVs01PostSignHandoff");
    expect(s).toContain("vs01_packet_ready=1");
    expect(s).toContain("[vs01-packet-prepared]");
    expect(s).toContain("[vs01-paid-pro-workspace-navigate]");
    expect(s).toContain("paidProPacketReadyDashboardPath");
    expect(s).toContain("vs01_saved=1");
    expect(s).toContain("[vs01-recipient-route-guard]");
    expect(s).toContain("onStepChange");
  });

  it("hydrates /app/esign/doc_* from a durable packet, not first-SPA agreement_bridge=1 only", () => {
    const s = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(s).toContain("allowBridgeCorpusHydrate");
    expect(s).toContain('sid.startsWith("doc_")');
    expect(s).toContain("readDurableAgreementVs01Bridge");
    expect(s).toContain("fetchDocumentEsignHandoff");
    expect(s).toContain("paidSessionDurablePacket");
    expect(s).not.toContain("agreementBridgeQuery && sid.startsWith(\"doc_\")");
    expect(s).toContain("Could not load this document");
    expect(s).toContain("vs01PaidSessionWorkspaceHydrateMinCorpusLen");
    expect(s).toContain("hydrateMinLen");
  });

  it("defers cold-open seed document fetch until auth token cache can be hydrated", () => {
    const s = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(s).toContain('from "../auth/AuthProvider"');
    expect(s).toContain("shouldDeferVs01SeedDocumentLoad");
    expect(s).toContain("authLoading");
    expect(s).toMatch(/\[seedDocumentId,\s*goToStep,\s*hideStepper,\s*authEnabled,\s*authLoading\]/);
  });
});
