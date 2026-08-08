/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProFirstReviewVisibleDisplayPlain } from "./paidProFirstReviewDisplayAuthority";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";

const COUNSEL_PREP = `Hey LawDog, I need help with a customer agreement issue.

We're trying to close a paid pilot with a mid-market customer. It's a 60-day pilot, about $15k SaaS deal.

Can you help me figure out:
1. Whether we should push them back to our pilot order form/MSA/DPA setup or accept their pilot agreement with edits.
2. Which terms are actual deal risks vs. normal legal noise.
3. What positions I should take on liability and SOC 2.

I'm not looking for a law school memo.`;

const PIXELFORGE_BODY = [
  "SERVICES AGREEMENT",
  "",
  "1. Services and Project Term",
  "Designer will provide product design services for Client's new mobile app UI during the six-week period.",
  "",
  "2. Compensation",
  "Client will pay Designer a flat fee of $4,500.",
  "",
  "9.1 Notices",
  "If to Alex Rivera:",
  "Alex Rivera",
  "",
  "If to PixelForge Labs:",
  "PixelForge Labs",
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT: Alex Rivera",
  "By: __________________________",
  "",
  "SERVICE PROVIDER:",
  "PixelForge Labs",
  "By: __________________________",
].join("\n");

describe("first-review contamination fail-closed", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    clearPaidProSourceOfTruth();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearPaidProSourceOfTruth();
    sessionStorage.clear();
  });

  it("refuses to paint PixelForge body when intake is SaaS counsel-prep", () => {
    const gen = getOrInitSessionAgreementGenerationId();
    establishPaidProSourceOfTruth({
      text: PIXELFORGE_BODY,
      source: "server_full_draft",
      agreementGenerationId: gen,
      reviewSessionId: gen,
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);

    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      intakeText: COUNSEL_PREP,
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
    });

    expect(painted.plain).toBe("");
    expect(painted.fallbackReason || "").toMatch(/intake_corpus_contamination/);
    // Structural mismatch still clears SoT so Retry cannot remount the wrong deal.
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("keeps Acme/ZYX SaaS body painted even if display intake is stale counsel-prep", () => {
    const acmeBody = [
      "SERVICES AGREEMENT",
      "",
      "This Services Agreement is between Acme LLC (Client) and ZYX Corp (Service Provider).",
      "",
      "1. Scope",
      "Service Provider will provide a 60-day SaaS pilot program.",
      "",
      "2. Fees",
      "Client will pay $15,000 for the pilot with optional conversion near $150,000 annually.",
      "",
      "9.1 Notices",
      "If to Acme LLC:",
      "Acme LLC",
      "",
      "If to ZYX Corp:",
      "ZYX Corp",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT: Acme LLC",
      "By: __________________________",
      "",
      "SERVICE PROVIDER:",
      "ZYX Corp",
      "By: __________________________",
    ].join("\n");
    const gen = getOrInitSessionAgreementGenerationId();
    establishPaidProSourceOfTruth({
      text: acmeBody,
      source: "server_full_draft",
      agreementGenerationId: gen,
      reviewSessionId: gen,
    });

    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      intakeText: COUNSEL_PREP,
      paidProActive: true,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
    });

    expect(painted.plain.length).toBeGreaterThan(200);
    expect(painted.plain).toMatch(/Acme LLC/);
    expect(painted.fallbackReason || "").not.toMatch(/intake_corpus_contamination/);
    expect(hasPaidProSourceOfTruth()).toBe(true);
  });
});
