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

  it("hydrates agreement_bridge=1 for server doc_* from session corpus (resume finalize)", () => {
    const s = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(s).toContain("allowBridgeCorpusHydrate");
    expect(s).toContain('sid.startsWith("doc_")');
    expect(s).toContain("agreementBridgeQuery && sid.startsWith(\"doc_\")");
    expect(s).toContain("Could not load this document");
  });
});
