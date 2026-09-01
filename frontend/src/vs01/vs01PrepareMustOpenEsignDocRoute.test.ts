/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { reviewPlainHasSkippedSectionNumbers } from "../components/agreements/reviewPlainSectionContinuity";
import {
  PACKET_READY_MUST_OPEN_ESIGN_DOC_ROUTE,
  isPacketReadyDocRoute,
  packetReadyWithoutDocRoute,
  privateSigningLinksRoute,
  resolvePacketReadyRemountLanding,
  resolvePostPrepareBuyerSurface,
} from "./vs01PrivateSigningLinksLanding";

const DOC_ID = "doc_persist_review_seed";

describe("Prepare after signers must open /app/esign/doc_*", () => {
  it("FAILs if packet-ready lands without a doc_* route", () => {
    expect(
      packetReadyWithoutDocRoute({
        documentId: DOC_ID,
        currentPath: "/app/create",
        navigateTo: null,
      }),
    ).toBe(true);
    expect(isPacketReadyDocRoute("/app/create")).toBe(false);
    expect(isPacketReadyDocRoute("/app/esign")).toBe(false);
    expect(isPacketReadyDocRoute(privateSigningLinksRoute(""))).toBe(false);
    expect(isPacketReadyDocRoute(`/app/esign/${DOC_ID}`)).toBe(true);
  });

  it("seed-ok Prepare from /app/create navigates to /app/esign/doc_* — not quiz, not Retry Pro draft", () => {
    const landing = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: DOC_ID,
      currentPath: "/app/create",
    });
    expect(landing.navigateTo).toBe(`/app/esign/${DOC_ID}`);
    expect(landing.reason).toBe(PACKET_READY_MUST_OPEN_ESIGN_DOC_ROUTE);
    expect(isPacketReadyDocRoute(landing.navigateTo ?? "")).toBe(true);
    expect(
      packetReadyWithoutDocRoute({
        documentId: DOC_ID,
        currentPath: "/app/create",
        navigateTo: landing.navigateTo,
      }),
    ).toBe(false);
  });

  it("packet-prepared remount of /app/create opens /app/esign/doc_*", () => {
    const landing = resolvePacketReadyRemountLanding({
      currentPath: "/app/create",
      documentId: DOC_ID,
      packetPrepared: true,
    });
    expect(landing.navigateTo).toBe(`/app/esign/${DOC_ID}`);
    expect(isPacketReadyDocRoute(landing.navigateTo ?? "")).toBe(true);
    expect(
      packetReadyWithoutDocRoute({
        documentId: DOC_ID,
        currentPath: "/app/create",
        navigateTo: landing.navigateTo,
      }),
    ).toBe(false);
  });

  it("does not invent leftover esign when packet-ready has no doc_*", () => {
    const landing = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: "",
      currentPath: "/app/create",
    });
    expect(landing.navigateTo).toBeNull();
    expect(isPacketReadyDocRoute(privateSigningLinksRoute(""))).toBe(false);
  });

  it("does not weaken 12-then-14 / 10-then-12 refuse", () => {
    const skipped1214 = [
      "1. Services and Deliverables",
      "2. Client Materials",
      "3. Fees and Payment",
      "4. Term and Termination",
      "5. Intellectual Property",
      "6. Confidentiality",
      "7. Representations and Warranties",
      "8. Limitation of Liability",
      "9. Indemnification",
      "10. Miscellaneous",
      "11. Independent Contractor",
      "12. Force Majeure",
      "14. Notices",
    ].join("\n\n");
    const skipped1012 = [
      "1. Services and Deliverables",
      "2. Fees and Payment",
      "3. Term and Termination",
      "4. Intellectual Property",
      "5. Confidentiality",
      "6. Limitation of Liability",
      "7. Indemnification",
      "8. Independent Contractor",
      "9. Force Majeure",
      "10. Miscellaneous",
      "12. Notices",
    ].join("\n\n");
    expect(reviewPlainHasSkippedSectionNumbers(skipped1214)).toBe(true);
    expect(reviewPlainHasSkippedSectionNumbers(skipped1012)).toBe(true);
  });

  it("tryNavigate falls through leftover bind failure to a fresh seed — does not open leftover esign", () => {
    const bridge = readFileSync(
      join(__dirname, "../launch/simpleProduct/agreementToVs01SigningBridge.ts"),
      "utf8",
    );
    const start = bridge.indexOf("export async function tryNavigatePaidProAgreementSenderFirstVs01Esign");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = bridge.slice(start, start + 9000);
    expect(block).toContain("bindReviewCorpusOntoSeededVs01Document");
    expect(block).toContain("[agreement-vs01-existing-bind-failed]");
    expect(block).toContain("Seed a new packet for this persist");
    expect(block).not.toMatch(/if \(!server\.ok\) return false/);
    expect(block).toContain("`/app/esign/${encodeURIComponent(vs01Seed.documentId)}?agreement_bridge=1`");
    expect(block).not.toContain("/app/create");
    expect(block).not.toMatch(/leftover_fused_content|esign_leftover_get_content/);
  });

  it("signature track handoff is VS01 /app/esign/doc_* — not review mint or Retry Pro draft", () => {
    const intake = readFileSync(
      join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    const trackStart = intake.indexOf("const enterGuidedSignatureTrackRoute");
    expect(trackStart).toBeGreaterThanOrEqual(0);
    const handoffAt = intake.indexOf("executePaidProPostRecipientSetupHandoff", trackStart);
    const track = intake.slice(trackStart, handoffAt + 1800);
    expect(track).toContain('premiumSendIntent: "signature"');
    expect(track).toContain("Place signature fields");
    expect(track).not.toContain("Links created—share when ready");
    expect(track).not.toContain("Retry Pro draft");
    expect(track).not.toContain("Invoice timing");

    const recovery = intake.slice(
      intake.indexOf("const showGuidedCompletionRecovery = Boolean("),
      intake.indexOf("const showGuidedCompletionRecovery = Boolean(") + 900,
    );
    expect(recovery).toContain("!paidProInlineSignersReady");
    expect(recovery).toContain("!signaturePreparationRequested");
    expect(recovery).toContain("!hasAuthoritativeSigningSnapshot()");
    expect(recovery).toContain("!guidedSigningPacketPreparedCurrent");

    const app = readFileSync(join(__dirname, "../ClawProductApp.tsx"), "utf8");
    expect(app).toContain("AppEsignDocumentShell");
    expect(app).toContain('case "esign"');
  });
});
