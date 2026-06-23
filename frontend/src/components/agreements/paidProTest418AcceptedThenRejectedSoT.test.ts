/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  applyPaidProSectionStructureCompletenessAuthority,
  evaluatePaidProSectionStructureFreezeGate,
} from "./paidProSectionStructureCompletenessAuthority";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  resolveHandoffPartySlotCount,
} from "./premiumPartyNamesHandoff";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  isPaidProSoTEstablishmentFailure,
  shouldHydratePaidProSoTAfterEstablishmentFailure,
  tryRecoverPaidProSourceOfTruthFromStructuralFailure,
} from "./paidProSoTStructuralRecovery";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  TEST418_MUTUAL_CONSULTING_INTAKE,
  TEST418_PARTY_EMAILS,
  buildTest418HierarchyBreakCorpus,
  test418Draft,
} from "./paidProTest418Fixtures";

describe("TEST418 — accepted-then-rejected Pro SoT dead-end and structural retry handling", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("rejects acceptance when section structure freeze gate would fail (hierarchy break corpus)", () => {
    const broken = buildTest418HierarchyBreakCorpus();
    markPaidProPipelineValidationPassed({ text: broken, source: "server_full_draft" });

    const freezeGate = evaluatePaidProSectionStructureFreezeGate(broken, "test418");
    expect(freezeGate.ok).toBe(false);
    expect(freezeGate.rejectReason).toBeTruthy();

    const validation = validatePaidProOutput({
      text: broken,
      rawIntake: TEST418_MUTUAL_CONSULTING_INTAKE,
      draft: test418Draft(),
      premiumPipelineSource: "server_full_draft_retry",
    });
    expect(validation.ok).toBe(false);
    expect(validation.reasons.some((r) => r.includes("section_structure"))).toBe(true);
  });

  it("does not hydrate partial SoT after structural freeze failure — recovery or retry only", () => {
    const broken = buildTest418HierarchyBreakCorpus();
    const prepared = preparePaidProServerDocumentForAcceptance(
      broken,
      test418Draft(),
      TEST418_MUTUAL_CONSULTING_INTAKE,
      { surface: "test418" },
    );
    markPaidProPipelineValidationPassed({ text: prepared.text, source: "server_full_draft_retry" });

    expect(() =>
      establishPaidProSourceOfTruth({
        text: prepared.text,
        source: "server_full_draft_retry",
        draft: test418Draft(),
        intakeText: TEST418_MUTUAL_CONSULTING_INTAKE,
      }),
    ).toThrow(/paid-pro-sot-freeze-blocked|section_structure/);

    const msg =
      "paid-pro-sot-freeze-blocked section_structure_incomplete reason=section_structure_synthetic_malformed_headings";
    expect(isPaidProSoTEstablishmentFailure(msg)).toBe(true);
    expect(shouldHydratePaidProSoTAfterEstablishmentFailure(msg)).toBe(false);
    expect(hasPaidProSourceOfTruth()).toBe(false);
  });

  it("deterministic structural recovery establishes reviewable SoT — not blank shell", () => {
    const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
      draft: test418Draft(),
      intakeText: TEST418_MUTUAL_CONSULTING_INTAKE,
      agreementGenerationId: getOrInitSessionAgreementGenerationId(),
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;

    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(4000);

    const render = resolvePaidProReviewRenderPlain({
      draft: test418Draft(),
      intakeText: TEST418_MUTUAL_CONSULTING_INTAKE,
    });
    expect(render.trim().length).toBeGreaterThan(4000);
    expect(render).not.toMatch(/^\s*MUTUAL CONSULTING SERVICES AGREEMENT\s*$/);
  });

  it("4-party signer metadata keeps all four emails through structural recovery", () => {
    const recovered = tryRecoverPaidProSourceOfTruthFromStructuralFailure({
      draft: test418Draft(),
      intakeText: TEST418_MUTUAL_CONSULTING_INTAKE,
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;

    const corpus = getPaidProSourceOfTruthText();
    for (const email of Object.values(TEST418_PARTY_EMAILS)) {
      expect(corpus).toContain(email);
    }

    const handoff = readPremiumRecipientHandoff();
    expect(handoff).not.toBeNull();
    const signerCount = resolveAuthoritativeSignerCount({
      intakeText: TEST418_MUTUAL_CONSULTING_INTAKE,
      draftParties: test418Draft().parties ?? [],
      manifestPartyCount: 4,
    });
    expect(signerCount.count).toBe(4);
    expect(resolveHandoffPartySlotCount(handoff!, signerCount.count)).toBe(4);
    const slots = linearPremiumRecipientSlots(handoff!, signerCount.count);
    expect(slots.length).toBe(4);
    expect(slots.filter((s) => String(s.email || "").trim().length > 0).length).toBe(4);
  });

  it("repair no longer inserts bare General Provisions intermediate shells", () => {
    const corpus = [
      "MUTUAL CONSULTING SERVICES AGREEMENT",
      "",
      "3. PAYMENT AND CONSIDERATION",
      "",
      "3.2 Additional Payment Terms",
      "Each Party will invoice according to written schedules.",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    ].join("\n\n");

    const repaired = applyPaidProSectionStructureCompletenessAuthority(corpus, {
      source: "test418_no_general_provisions_insert",
      phase: "pre_freeze",
    });
    expect(repaired.text).not.toMatch(/^\s*3\.1\s+General Provisions\s*$/im);
    expect(
      repaired.repairs.some((r) => r.startsWith("insert_missing_intermediate:3.1")),
    ).toBe(false);
  });
});
