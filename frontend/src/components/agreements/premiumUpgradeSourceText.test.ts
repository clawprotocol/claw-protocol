import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildUpgradeSourceTextForPremium } from "./premiumUpgradeSourceText";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import * as orig from "./originalUserIntakeRawStorage";
import { stashCreateComplexityResume } from "./agreementCreateComplexityResume";
import * as storage from "./agreementIntakeStorage";

const longPrompt =
  "I need a freelance software development agreement. Anthem Blanchard hires Sarah Collins to redesign and optimize the CryptoSpaces.net website for $7,500 total.";

const mockDraftPayment: ParsedDraftShape["payment"] = {
  amount: 7_500,
  cadence: "milestone",
  valid: true,
};

describe("buildUpgradeSourceTextForPremium", () => {
  const storageMap = new Map<string, string>();

  const minimalDraft: ParsedDraftShape = {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    purpose: "Party A provides services to Party B.",
    payment_terms: "$7,500 total; $3,000 upfront; $4,500 on final delivery",
    parties: [
      { name: "Party A", role: "Client" },
      { name: "Party B", role: "Provider" },
    ],
    duration: "30 days",
    due_date: "within 30 days",
    effective_date: "May 1, 2026",
    payment: mockDraftPayment,
    agreement_family: "independent_contractor_agreement",
  };

  beforeEach(() => {
    storageMap.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => storageMap.set(k, v),
      removeItem: (k: string) => storageMap.delete(k),
    });
    vi.spyOn(orig, "readOriginalUserIntakeRaw").mockReturnValue("");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("prefers session-stored original intake over short starter document text", () => {
    vi.spyOn(orig, "readOriginalUserIntakeRaw").mockReturnValue(longPrompt);
    const out = buildUpgradeSourceTextForPremium({
      intakeCombined: "",
      structuredDraft: minimalDraft,
      agreementDocumentText: "A".repeat(250), // long but wrong
    });
    expect(out).toContain("Anthem Blanchard");
    expect(out).toContain("CryptoSpaces.net");
  });

  it("uses resume originalUserIntakeRaw when session is empty", () => {
    stashCreateComplexityResume({
      rawIntake: "short",
      pending: minimalDraft,
      awaitingProCheckout: true,
      originalUserIntakeRaw: longPrompt,
      resume_kind: "optional_full_upgrade",
    });
    const out = buildUpgradeSourceTextForPremium({
      intakeCombined: "",
      structuredDraft: null,
      agreementDocumentText: "",
    });
    expect(out).toContain("Anthem Blanchard");
  });

  it("falls back to readAgreementCreatorIntakeStorage when higher-priority sources are short", () => {
    vi.spyOn(storage, "readAgreementCreatorIntakeStorage").mockReturnValue(longPrompt);
    const out = buildUpgradeSourceTextForPremium({
      intakeCombined: "x",
      structuredDraft: null,
      agreementDocumentText: "",
    });
    expect(out).toContain("Anthem Blanchard");
  });
});
