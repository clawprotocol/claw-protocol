/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  clearAcceptedServerFullDraftLatchAndSessionFrozenBodies,
  latchAcceptedServerFullDraftAuthority,
} from "./premiumAcceptancePolicy";
import { resolveGuidedCompletionRenderDocument } from "./guidedDealCompletion/guidedCompletionRenderAuthority";

const SUBSTANTIVE = [
  "SERVICES AGREEMENT",
  "",
  "This Services Agreement is between Niceman Corp (Client) and Waffle LLC (Service Provider).",
  "",
  "1. Scope",
  "Service Provider will provide a 60-day SaaS pilot program for Client.",
  "",
  "2. Fees",
  "Client will pay $15,000 for the pilot. Optional conversion near $150,000 annually.",
  "",
  "3. Term",
  "Services Term is 60 days from the Effective Date.",
  "",
  "4. Governing Law",
  "This Agreement is governed by the laws of Iowa.",
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT: Niceman Corp",
  "By: __________________________",
  "",
  "SERVICE PROVIDER:",
  "Waffle LLC",
  "By: __________________________",
  "",
  // Latch requires LONG_PREMIUM_AUTHORITATIVE_MIN_LEN (15k) — matches live retest docLen ~21k.
  "Additional commercial terms covering liability, IP, indemnity, audit, data deletion, and SOC 2. ".repeat(200),
].join("\n");

describe("accepted paint lock after freeze (Niceman/Waffle retest)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearPaidProSourceOfTruth();
    clearAcceptedServerFullDraftLatchAndSessionFrozenBodies();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPaidProSourceOfTruth();
    clearAcceptedServerFullDraftLatchAndSessionFrozenBodies();
    sessionStorage.clear();
  });

  it("forces canonical review corpus from freeze latch without SoT", () => {
    latchAcceptedServerFullDraftAuthority(SUBSTANTIVE, "server_full_draft", {
      freezeEstablished: true,
    });

    expect(hasCanonicalReviewCorpusForRender()).toBe(true);
    expect(resolveCanonicalReviewCorpusLenForRender()).toBeGreaterThanOrEqual(1000);
  });

  it("guided paid gate fail-opens to agreement document when validated empty", () => {
    const painted = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: false,
      paidProCreateFlowReviewGate: true,
      validatedCorpusPlain: "",
      agreementDocumentPlain: SUBSTANTIVE,
      lastKnownGoodPlain: "",
      authoritativeHydratedPlain: "",
    });
    expect(painted.source).not.toBe("none");
    expect(painted.plainText).toMatch(/Niceman Corp/);
    expect(painted.plainText.length).toBeGreaterThan(500);
  });
});
