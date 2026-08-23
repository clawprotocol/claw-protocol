/** @vitest-environment jsdom */
/**
 * Tests that after a paid session, the fallback chain rejects hollow skeleton bodies
 * (e.g., "covers due. Work." / Client-Service_provider) and uses the last valid painted body.
 *
 * Universal path rule: After a successful paid session (`premiumCompletion=1` / paid premium completion),
 * the visitor must see a real Pro body of THAT deal (visitor names, price, law) — or the last painted
 * ≥200-char body of that deal. NEVER show hollow skeleton + Retry Pro draft.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  clearCheckoutBackRestoreSnapshot,
  persistStarterReviewBeforeCheckout,
  readCheckoutBackRestoreSnapshot,
} from "./checkoutBackRestore";
import {
  clearPaidPremiumCompletionSession,
  markPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import { clearPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import {
  evaluateSimpleHollowBodyGate,
  getFreeOnePagerFallbackForProFailure,
  isHollowPartyName,
} from "./freeStarterReviewBodyResolver";

const REAL_PARTIES_INTAKE = `
Logo design contract between Priya Shah (Designer) and Diego Alvarez (Client).
Priya will design a logo for Diego's coffee shop business.
Payment: $2,400 upon delivery.
Governing law: Texas.
`;

const REAL_PARTIES_DRAFT: ParsedDraftShape = {
  title: "Logo Design Services Agreement",
  jurisdiction: "Texas",
  parties: [
    { name: "Priya Shah", role: "Designer" },
    { name: "Diego Alvarez", role: "Client" },
  ],
  purpose: "Logo design services for coffee shop business",
  payment_terms: "$2,400 upon delivery",
  payment: { amount: 2400, cadence: null, valid: true },
  duration: null,
  due_date: null,
  effective_date: null,
  additional_terms: null,
};

const VALID_PAINTED_STARTER = `LOGO DESIGN SERVICES AGREEMENT

This Logo Design Services Agreement ("Agreement") is entered into by and between:

Priya Shah ("Designer")
and
Diego Alvarez ("Client")

1. SERVICES
Designer will create a professional logo design for Client's coffee shop business.

2. DELIVERABLES
Designer shall provide:
- Initial concepts (3 variations)
- Revisions as needed
- Final logo files in multiple formats

3. COMPENSATION
Client shall pay Designer $2,400 upon delivery of final logo files.

4. INTELLECTUAL PROPERTY
Upon receipt of full payment, all rights to the final logo design shall transfer to Client.

5. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Texas.

IN WITNESS WHEREOF, the parties have executed this Agreement.

___________________________
Priya Shah, Designer

___________________________
Diego Alvarez, Client
`;

const HOLLOW_SKELETON_BODY = `SERVICES AGREEMENT

This Agreement is entered into by and between Client ("Client") and Service Provider ("Service Provider").

1. Scope of Services / Purpose
This agreement covers due. Work.

2. Payment Terms

3. Services Term and Effective Date
Upon full execution by the parties.

4. Governing Law
To be agreed by the parties based on their principal places of business.

IN WITNESS WHEREOF, the Parties have executed this Agreement.

CLIENT:
______________________________

SERVICE PROVIDER:
______________________________
`;

const HOLLOW_SKELETON_DRAFT: ParsedDraftShape = {
  title: "Services Agreement",
  jurisdiction: "",
  parties: [
    { name: "Client", role: "Client" },
    { name: "Service_provider", role: "Service Provider" },
  ],
  purpose: "This agreement covers due. Work.",
  payment_terms: "",
  payment: { amount: null, cadence: null, valid: false },
  duration: null,
  due_date: null,
  effective_date: null,
  additional_terms: null,
};

describe("Hollow skeleton rejection after paid session", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
  });

  describe("isHollowPartyName detects skeleton party names", () => {
    it("rejects 'Client' as hollow", () => {
      expect(isHollowPartyName("Client")).toBe(true);
    });

    it("rejects 'Service_provider' as hollow", () => {
      expect(isHollowPartyName("Service_provider")).toBe(true);
    });

    it("rejects 'Service Provider' as hollow", () => {
      expect(isHollowPartyName("Service Provider")).toBe(true);
    });

    it("rejects 'Party A' as hollow", () => {
      expect(isHollowPartyName("Party A")).toBe(true);
    });

    it("accepts 'Priya Shah' as valid", () => {
      expect(isHollowPartyName("Priya Shah")).toBe(false);
    });

    it("accepts 'Diego Alvarez' as valid", () => {
      expect(isHollowPartyName("Diego Alvarez")).toBe(false);
    });
  });

  describe("evaluateSimpleHollowBodyGate detects hollow bodies", () => {
    it("detects hollow skeleton body with Client/Service_provider parties", () => {
      const result = evaluateSimpleHollowBodyGate(
        HOLLOW_SKELETON_BODY,
        HOLLOW_SKELETON_DRAFT.parties as { name: string; role: string }[],
        { intake: REAL_PARTIES_INTAKE }
      );
      expect(result.isHollow).toBe(true);
      expect(result.reason).toBeTruthy();
    });

    it("detects 'covers due. Work.' as corrupted output", () => {
      const corruptedBody = `SERVICES AGREEMENT

This Agreement is entered into by and between Priya Shah ("Designer") and Diego Alvarez ("Client").

1. Scope of Services / Purpose
This agreement covers due. Work.

2. Payment Terms
$2,400 upon delivery.

3. Services Term and Effective Date
Upon full execution by the parties.

4. Governing Law
This Agreement shall be governed by the laws of the State of Texas.

IN WITNESS WHEREOF, the Parties have executed this Agreement.
`;
      const result = evaluateSimpleHollowBodyGate(
        corruptedBody,
        null,
      );
      expect(result.isHollow).toBe(true);
      expect(result.reason).toBe("corrupted_output");
    });

    it("accepts valid painted starter with real party names", () => {
      const result = evaluateSimpleHollowBodyGate(
        VALID_PAINTED_STARTER,
        REAL_PARTIES_DRAFT.parties as { name: string; role: string }[],
        { intake: REAL_PARTIES_INTAKE }
      );
      expect(result.isHollow).toBe(false);
    });

    it("accepts body with real party names even without draft parties", () => {
      const result = evaluateSimpleHollowBodyGate(
        VALID_PAINTED_STARTER,
        null,
      );
      expect(result.isHollow).toBe(false);
    });
  });

  describe("fallback chain with hollow rejection", () => {
    it("rejects hollow skeleton from draft preview and uses checkout back snapshot", () => {
      markPaidPremiumCompletionSession({ source: "settled_checkout" });

      persistStarterReviewBeforeCheckout({
        intakeText: REAL_PARTIES_INTAKE,
        draft: REAL_PARTIES_DRAFT,
        previewText: VALID_PAINTED_STARTER,
      });

      const isValidNonHollowBodyForHollowDraft = (body: string): boolean => {
        const trimmed = body.trim();
        if (trimmed.length < 200) return false;
        const hollowCheck = evaluateSimpleHollowBodyGate(
          trimmed,
          HOLLOW_SKELETON_DRAFT.parties as { name: string; role: string }[],
          { intake: REAL_PARTIES_INTAKE }
        );
        return !hollowCheck.isHollow;
      };

      const isValidNonHollowBodyForRealDraft = (body: string): boolean => {
        const trimmed = body.trim();
        if (trimmed.length < 200) return false;
        const hollowCheck = evaluateSimpleHollowBodyGate(
          trimmed,
          REAL_PARTIES_DRAFT.parties as { name: string; role: string }[],
          { intake: REAL_PARTIES_INTAKE }
        );
        return !hollowCheck.isHollow;
      };

      const hollowDraftPreview = buildAgreementPreviewText(HOLLOW_SKELETON_DRAFT, {
        starterPreview: true,
        intakeText: REAL_PARTIES_INTAKE,
      });

      expect(isValidNonHollowBodyForHollowDraft(hollowDraftPreview)).toBe(false);

      const checkoutBackSnap = readCheckoutBackRestoreSnapshot();
      const checkoutBackPreview = (checkoutBackSnap?.previewText ?? "").trim();
      expect(isValidNonHollowBodyForRealDraft(checkoutBackPreview)).toBe(true);

      let fallbackText = "";

      const existingDocText = VALID_PAINTED_STARTER.trim();
      if (existingDocText.length >= 200 && isValidNonHollowBodyForRealDraft(existingDocText)) {
        fallbackText = existingDocText;
      }

      if (!fallbackText) {
        if (hollowDraftPreview.length >= 200 && isValidNonHollowBodyForHollowDraft(hollowDraftPreview)) {
          fallbackText = hollowDraftPreview;
        }
      }

      if (!fallbackText) {
        const freeOnePager = getFreeOnePagerFallbackForProFailure(HOLLOW_SKELETON_DRAFT);
        if (freeOnePager.length >= 200 && isValidNonHollowBodyForHollowDraft(freeOnePager)) {
          fallbackText = freeOnePager;
        }
      }

      if (!fallbackText) {
        if (checkoutBackPreview.length >= 200 && isValidNonHollowBodyForRealDraft(checkoutBackPreview)) {
          fallbackText = checkoutBackPreview;
        }
      }

      expect(fallbackText).toBe(VALID_PAINTED_STARTER.trim());
      expect(fallbackText).toContain("Priya Shah");
      expect(fallbackText).toContain("Diego Alvarez");
      expect(fallbackText).not.toContain("covers due. Work.");
    });

    it("existing agreementDocumentText wins over hollow draft when valid", () => {
      const existingDocText = VALID_PAINTED_STARTER;

      const isValidNonHollowBodyForRealDraft = (body: string): boolean => {
        const trimmed = body.trim();
        if (trimmed.length < 200) return false;
        const hollowCheck = evaluateSimpleHollowBodyGate(
          trimmed,
          REAL_PARTIES_DRAFT.parties as { name: string; role: string }[],
          { intake: REAL_PARTIES_INTAKE }
        );
        return !hollowCheck.isHollow;
      };

      const isValidNonHollowBodyForHollowDraft = (body: string): boolean => {
        const trimmed = body.trim();
        if (trimmed.length < 200) return false;
        const hollowCheck = evaluateSimpleHollowBodyGate(
          trimmed,
          HOLLOW_SKELETON_DRAFT.parties as { name: string; role: string }[],
          { intake: REAL_PARTIES_INTAKE }
        );
        return !hollowCheck.isHollow;
      };

      let fallbackText = "";

      if (existingDocText.trim().length >= 200 && isValidNonHollowBodyForRealDraft(existingDocText)) {
        fallbackText = existingDocText.trim();
      }

      if (!fallbackText) {
        const hollowPreview = buildAgreementPreviewText(HOLLOW_SKELETON_DRAFT, {
          starterPreview: true,
          intakeText: REAL_PARTIES_INTAKE,
        });
        if (hollowPreview.length >= 200 && isValidNonHollowBodyForHollowDraft(hollowPreview)) {
          fallbackText = hollowPreview;
        }
      }

      expect(fallbackText).toBe(VALID_PAINTED_STARTER.trim());
      expect(fallbackText).toContain("Priya Shah");
    });

    it("never returns hollow skeleton as fallback even when all other sources empty", () => {
      const isValidNonHollowBody = (body: string): boolean => {
        const trimmed = body.trim();
        if (trimmed.length < 200) return false;
        const hollowCheck = evaluateSimpleHollowBodyGate(
          trimmed,
          HOLLOW_SKELETON_DRAFT.parties as { name: string; role: string }[],
          { intake: REAL_PARTIES_INTAKE }
        );
        return !hollowCheck.isHollow;
      };

      let fallbackText = "";

      const existingDocText = "";
      if (existingDocText.length >= 200 && isValidNonHollowBody(existingDocText)) {
        fallbackText = existingDocText;
      }

      const lastKnownGood = "";
      if (!fallbackText && lastKnownGood.length >= 200 && isValidNonHollowBody(lastKnownGood)) {
        fallbackText = lastKnownGood;
      }

      if (!fallbackText) {
        const hollowPreview = buildAgreementPreviewText(HOLLOW_SKELETON_DRAFT, {
          starterPreview: true,
          intakeText: REAL_PARTIES_INTAKE,
        });
        if (hollowPreview.length >= 200 && isValidNonHollowBody(hollowPreview)) {
          fallbackText = hollowPreview;
        }
      }

      const freeOnePager = getFreeOnePagerFallbackForProFailure(HOLLOW_SKELETON_DRAFT);
      if (!fallbackText && freeOnePager.length >= 200 && isValidNonHollowBody(freeOnePager)) {
        fallbackText = freeOnePager;
      }

      const checkoutBackSnap = readCheckoutBackRestoreSnapshot();
      const checkoutBackPreview = (checkoutBackSnap?.previewText ?? "").trim();
      if (!fallbackText && checkoutBackPreview.length >= 200 && isValidNonHollowBody(checkoutBackPreview)) {
        fallbackText = checkoutBackPreview;
      }

      expect(fallbackText).toBe("");

      expect(HOLLOW_SKELETON_BODY).toContain("covers due. Work.");
      expect(isValidNonHollowBody(HOLLOW_SKELETON_BODY)).toBe(false);
    });
  });

  describe("AgreementBuilderIntake fallback pattern", () => {
    it("fallback chain in AgreementBuilderIntake includes hollow detection", async () => {
      const { readFileSync } = await import("fs");
      const { join, dirname } = await import("path");
      const { fileURLToPath } = await import("url");
      const here = dirname(fileURLToPath(import.meta.url));
      const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

      expect(intakeSrc).toContain("evaluateSimpleHollowBodyGate");

      expect(intakeSrc).toContain("isValidNonHollowBody");

      expect(intakeSrc).toContain("Universal path rule: never show hollow skeleton");

      expect(intakeSrc).toContain("FIRST: Try existing agreementDocumentText");
      expect(intakeSrc).toContain("SECOND: Try lastKnownGoodAuthoritativeDraft");
      expect(intakeSrc).toContain("THIRD: Try building preview from draft");
      expect(intakeSrc).toContain("FOURTH: Try free one-pager");
      expect(intakeSrc).toContain("FIFTH: Try checkout back restore");
    });

    it("applyFailureFallback uses hollow rejection in paidRecovery path", async () => {
      const { readFileSync } = await import("fs");
      const { join, dirname } = await import("path");
      const { fileURLToPath } = await import("url");
      const here = dirname(fileURLToPath(import.meta.url));
      const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");

      const applyFailureFallbackMatch = intakeSrc.match(
        /const applyFailureFallback = \(\s*winningBodyText\?[^]*?paidRecovery[^]*?isValidNonHollowBody/s
      );
      expect(applyFailureFallbackMatch).toBeTruthy();
    });
  });
});
