import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildUpgradeSourceTextForPremium } from "./premiumUpgradeSourceText";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import * as orig from "./originalUserIntakeRawStorage";
import * as storage from "./agreementIntakeStorage";

const longPrompt =
  "I need a freelance software development agreement. Anthem Blanchard hires Sarah Collins to redesign and optimize the CryptoSpaces.net website for $7,500 total.";

describe("buildUpgradeSourceTextForPremium", () => {
  const minimalDraft: ParsedDraftShape = {
    title: "Services Agreement",
    purpose: "Party A provides services to Party B.",
    payment_terms: "Compensation as agreed.",
    parties: [
      { name: "Party A", role: "Client" },
      { name: "Party B", role: "Provider" },
    ],
    agreement_family: "independent_contractor",
  } as ParsedDraftShape;

  beforeEach(() => {
    vi.spyOn(orig, "readOriginalUserIntakeRaw").mockReturnValue("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prefers session-stored original intake over short starter document text", () => {
    vi.spyOn(orig, "readOriginalUserIntakeRaw").mockReturnValue(longPrompt);
    const out = buildUpgradeSourceTextForPremium({
      resume: null,
      intakeCombined: "",
      structuredDraft: minimalDraft,
      agreementDocumentText: "A".repeat(250), // long but wrong
    });
    expect(out).toContain("Anthem Blanchard");
    expect(out).toContain("CryptoSpaces.net");
  });

  it("uses resume originalUserIntakeRaw when session is empty", () => {
    const out = buildUpgradeSourceTextForPremium({
      resume: {
        version: 1,
        rawIntake: "short",
        pending: minimalDraft,
        awaitingProCheckout: true,
        savedAt: 1,
        originalUserIntakeRaw: longPrompt,
      } as any,
      intakeCombined: "",
      structuredDraft: minimalDraft,
      agreementDocumentText: "",
    });
    expect(out).toContain("Anthem Blanchard");
  });

  it("falls back to readAgreementCreatorIntakeStorage when higher-priority sources are short", () => {
    vi.spyOn(storage, "readAgreementCreatorIntakeStorage").mockReturnValue(longPrompt);
    const out = buildUpgradeSourceTextForPremium({
      resume: null,
      intakeCombined: "x",
      structuredDraft: null,
      agreementDocumentText: "",
    });
    expect(out).toContain("Anthem Blanchard");
  });
});
