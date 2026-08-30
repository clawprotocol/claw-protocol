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
    expect(s).toContain("[vs01-private-signing-links-stay]");
    expect(s).toContain("resolvePostPrepareBuyerSurface");
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

  it("defers cold-open seed document fetch until auth token cache can be hydrated", () => {
    const s = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(s).toContain('from "../auth/AuthProvider"');
    expect(s).toContain("shouldDeferVs01SeedDocumentLoad");
    expect(s).toContain("authLoading");
    expect(s).toMatch(/\[seedDocumentId,\s*goToStep,\s*hideStepper,\s*authEnabled,\s*authLoading\]/);
  });

  it("remount of leftover esign binds Review corpus before paint", () => {
    const s = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(s).toContain("ensureReviewCorpusOnEsignEntry");
    expect(s).toContain('from "./vs01EsignRemountReviewBind"');
    const start = s.indexOf("/** Deep link: /app/esign/:documentId");
    const hydrateAt = s.indexOf("const hydrateLocalPaidProBridge", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(hydrateAt).toBeGreaterThan(start);
    expect(s.slice(start, hydrateAt)).toContain("ensureReviewCorpusOnEsignEntry");
    expect(s).toContain("reviewCorpusLooksLikeLeftoverFusedNotices");
    expect(s).toContain("packetPlainMatchesPersistReviewCorpus");
    expect(s).toContain("leftoverRemountShouldFailClosedToast");
    expect(s).toContain("leftoverGetContentRefuseFromError");
    expect(s).toContain("persistReviewCorpus");
    expect(s).toContain("bound.persistReviewCorpus");
    expect(s).toContain("leftoverGetContentRefuseFromError(e) && persistReviewCorpus");
    expect(s).toMatch(/leftoverPacketNotPersistReview[\s\S]*if \(persistReviewCorpus\)/);
    expect(s).toMatch(
      /if \(bound && !bound\.ok\)[\s\S]*leftoverRemountShouldFailClosedToast\(persistReviewCorpus\)/,
    );
    expect(s).toContain("Fail-closed toast only when persist Review truly does not exist");
  });
});
