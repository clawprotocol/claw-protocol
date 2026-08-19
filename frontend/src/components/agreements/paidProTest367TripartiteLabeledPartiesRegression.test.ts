import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractAgreementParties } from "../../agreement/extractAgreementParties";
import { bumpAgreementGenerationId } from "../../lib/agreementGenerationId";
import { buildAgreementPreviewTextCore } from "./agreementPreviewFromDraft";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import {
  buildPremiumPostCheckoutLocalRecoveryProDraft,
  PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
} from "./premiumNetworkRecoveryLocalDraft";
import { runPremiumCompletion } from "./premiumCompletionPipeline";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";
import { clearFrozenPremiumSessionBodiesForTests } from "./premiumAcceptancePolicy";
import { clearPremiumParseSessionGuard } from "./premiumParseSessionGuard";
import { clearPremiumGenerationCallAudit } from "./paidProPremiumGenerationCallAudit";
import {
  clearPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  markCurrentSessionProEntitlementComplete,
  clearCurrentSessionProEntitlementMarkers,
} from "./paidProSessionEligibility";
import { PREMIUM_USABLE_BODY_MIN_LEN } from "./premiumPostCheckoutApplyEligible";
import { rejectPremiumBodyForProRender } from "./premiumFullDraftClientAcceptance";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import { resolveUniversalSignerMetadataBySlot } from "./universalSignerMetadataAuthority";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";
import { previewPostCheckoutRecoverySotCommit } from "./paidProPostCheckoutRecoveryAuthority";
import { meetsPaidProDegradedRecoveryDisplayRequirements } from "./paidProPostCheckoutRenderGate";

export const TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE = `Create a TRIPARTITE SOFTWARE DEVELOPMENT AND REVENUE SHARING AGREEMENT.

Party 1
Legal Entity: Red Mesa Logistics LLC
Signer Name: Sarah Mitchell
Signer Title: Chief Executive Officer
Signer Email: sarah@redmesalogistics.com
Address: 845 Tyrone St., Bentonville, AR 75029

Party 2
Legal Entity: Harbor Peak Automation LLC
Signer Name: Robert Henderson
Signer Title: Managing Member
Signer Email: contact@harborpeakautomation.com

Party 3
Legal Entity: Blue Canyon Analytics LLC
Signer Name: Unknown
Signer Title: Unknown
Signer Email: Unknown

Purpose: Development and maintenance of a custom freight optimization platform, including analytics dashboard work.

Term: twenty-four (24) months.

Payment: $120,000 in four milestone payments to the applicable Party; $3,000 per month to the applicable Party for analytics services.

Revenue sharing: Red Mesa 50%, Harbor Peak 30%, Blue Canyon 20%.

Each party will keep confidential information received from the other parties confidential and will not disclose it except as required by law. Each party will share licensing revenue per the revenue sharing terms above.

Oklahoma law governs. Electronic execution via LawDog.`;

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: false };

function emptyDraft() {
  return {
    title: "",
    jurisdiction: "",
    parties: [],
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
  };
}

function buildTest367Draft() {
  return runIntakeDefaultsAndRoles(
    emptyDraft(),
    TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
    true,
    defaultIntakePartyRoleLabels(),
  );
}

function buildRejectedDegradedServerBody(targetLen: number): string {
  const header = [
    "TRIPARTITE SOFTWARE DEVELOPMENT AND REVENUE SHARING AGREEMENT",
    "",
    "licensing revenue and information known at intake are not real parties.",
    "",
  ].join("\n");
  let body = header;
  let i = 0;
  while (body.length < targetLen) {
    body += `\nSection ${i + 1}. [claw_full_draft_expansion_v1] degraded filler. `;
    i += 1;
  }
  return body;
}

const h = vi.hoisted(() => {
  const doc = buildRejectedDegradedServerBody(320);
  return {
    mockResult: {
      title: "Tripartite Software Development and Revenue Sharing Agreement",
      agreement_family: "services_agreement",
      document_text: doc,
      server_full_document_text: doc,
      key_terms_found: [] as string[],
      missing_material_info: [] as string[],
      generation_outcome: "degraded",
      server_generation_failure_code: "json_parse",
      server_generation_failure_message: "Structured intelligence JSON failed to parse.",
    } satisfies PremiumFullDraftResult,
  };
});

vi.mock("./premiumFullDraftApi", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./premiumFullDraftApi")>();
  return {
    ...mod,
    postPremiumFullDraftWithRetry: () =>
      Promise.resolve({ ok: true as const, result: h.mockResult }),
    postPremiumFullDraftOnce: () => Promise.resolve(h.mockResult),
  };
});

describe("paidPro test367 tripartite labeled parties regression", () => {
  beforeEach(() => {
    clearFrozenPremiumSessionBodiesForTests();
    clearPremiumParseSessionGuard();
    clearPremiumGenerationCallAudit();
    clearPaidProSourceOfTruth();
    clearCurrentSessionProEntitlementMarkers();
    bumpAgreementGenerationId();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
    const doc = buildRejectedDegradedServerBody(320);
    h.mockResult.document_text = doc;
    h.mockResult.server_full_document_text = doc;
  });

  it("free starter names all 3 LLC parties and rejects bogus fragment parties", () => {
    const draft = buildTest367Draft();
    const preview = buildAgreementPreviewTextCore(draft, {
      starterPreview: true,
      intakeText: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
    });

    expect(labeledPartyLegalEntities(TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE)).toHaveLength(3);
    expect(draft.parties.map((p) => p.name)).toEqual([
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
      "Blue Canyon Analytics LLC",
    ]);

    const recital = preview.match(/entered into[\s\S]{0,500}/i)?.[0] ?? preview;
    expect(recital).toMatch(/Red Mesa Logistics LLC/i);
    expect(recital).toMatch(/Harbor Peak Automation LLC/i);
    expect(recital).toMatch(/Blue Canyon Analytics LLC/i);
    expect(preview).not.toMatch(/licensing revenue/i);
    expect(preview).not.toMatch(/information known at intake/i);

    const signatureNames = extractAgreementParties({
      parties: draft.parties,
      intakeText: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      renderedText: preview,
    });
    expect(signatureNames).toEqual([
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
      "Blue Canyon Analytics LLC",
    ]);
  });

  it("canonical manifest and signer metadata preserve 3 party slots", () => {
    const draft = buildTest367Draft();
    const partyNames = draft.parties.map((p) => p.name);

    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
        draftPartyNames: partyNames,
        rawPartyCount: 3,
      }),
    ).toBe(3);

    const manifest = resolveCanonicalFinalPartyManifest({
      partyCount: 3,
      draftPartyNames: partyNames,
      intakeText: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "sarah@redmesalogistics.com",
      recipient2Email: "contact@harborpeakautomation.com",
      extraPartyReviewEmails: [],
      partySignerNames: ["Sarah Mitchell", "Robert Henderson", ""],
      partySignerTitles: ["Chief Executive Officer", "Managing Member", ""],
      sendMode: "signature",
      recipientsDeferred: false,
    });
    expect(manifest.parties).toHaveLength(3);
    expect(manifest.parties.map((p) => p.partyName)).toEqual([
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
      "Blue Canyon Analytics LLC",
    ]);

    const signerSlots = resolveUniversalSignerMetadataBySlot({
      legalEntities: partyNames,
      intakeText: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      draftParties: draft.parties.map((p) => ({
        name: p.name,
        signerName: null,
        signerTitle: null,
      })),
    });
    expect(signerSlots).toHaveLength(3);
    expect(signerSlots[0]?.signerName).toBe("Sarah Mitchell");
    expect(signerSlots[1]?.signerName).toBe("Robert Henderson");
  });

  it("local degraded recovery builds paid corpus from intake authority, not corrupted draft parties", () => {
    const draft = buildTest367Draft();
    const corruptedDraft = {
      ...draft,
      parties: [
        { name: "licensing revenue", role: "party" },
        { name: "information known at intake", role: "party" },
      ],
    };

    const recovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: corruptedDraft,
      rawIntake: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recovery.ok).toBe(true);
    const body = recovery.body;
    expect(body.length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);

    for (const token of [
      "Red Mesa Logistics LLC",
      "Harbor Peak Automation LLC",
      "Blue Canyon Analytics LLC",
      "Sarah Mitchell",
      "Chief Executive Officer",
      "sarah@redmesalogistics.com",
      "contact@harborpeakautomation.com",
      "845 Tyrone St., Bentonville, AR 75029",
      "Robert Henderson",
      "Managing Member",
      "twenty-four (24) months",
      "$120,000",
      "$3,000 per month",
      "50%",
      "30%",
      "20%",
      "Oklahoma",
    ]) {
      expect(body).toMatch(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }

    expect(body).not.toMatch(/licensing revenue/i);
    expect(body).not.toMatch(/information known at intake/i);
    expect(body).not.toMatch(/\bUnknown\b/);
    expect(body).not.toMatch(/\[Not yet specified\]/i);

    const renderGate = rejectPremiumBodyForProRender(body, {
      intakeLower: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE.toLowerCase(),
      intakeText: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      partyNames: labeledPartyLegalEntities(TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE),
    });
    expect(renderGate.ok).toBe(true);
    expect(
      meetsPaidProDegradedRecoveryDisplayRequirements(body, TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE),
    ).toBe(true);
  });

  it(
    "HTTP 200 degraded/json_parse upgrades via local recovery instead of corrupted free starter",
    async () => {
    const draft = buildTest367Draft();
    const corruptedDraft = {
      ...draft,
      parties: [
        { name: "licensing revenue", role: "party" },
        { name: "information known at intake", role: "party" },
      ],
    };
    const localRecovery = buildPremiumPostCheckoutLocalRecoveryProDraft({
      draft: corruptedDraft,
      rawIntake: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      recoverySurface: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(localRecovery.ok, `localRecovery:${JSON.stringify(localRecovery.reasons)}`).toBe(true);
    expect(
      meetsPaidProDegradedRecoveryDisplayRequirements(
        localRecovery.body,
        TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      ),
      `meetsDisplay:len=${localRecovery.body.length}`,
    ).toBe(true);
    const recoveryPreview = previewPostCheckoutRecoverySotCommit({
      body: localRecovery.body,
      draft,
      intakeText: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      premiumRenderSource: PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE,
    });
    expect(recoveryPreview.eligible).toBe(true);

    const out = await runPremiumCompletion({
      intakeText: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      originalUserIntakeRawForMerge: TEST367_TRIPARTITE_LABELED_PARTIES_INTAKE,
      structuredDraft: corruptedDraft,
      simpleProductFlow: true,
      partyRoleLabels: defaultIntakePartyRoleLabels(),
      userGapAnswers: null,
      agreementGenerationId: "g-test367",
      premiumRequestIntakeFingerprint: "fp-test367",
      isPremiumRequestStillValid: () => true,
      parseDraft: async () => corruptedDraft,
    });

    expect(out.premiumDegradedServerRecoverable).toBe(true);

    expect(out.premiumRenderSource).toBe(PREMIUM_DEGRADED_SERVER_LOCAL_RECOVERY_RENDER_SOURCE);
    expect(out.premiumDegradedServerLocalRecovery).toBe(true);
    expect(out.winningPremiumBodyText.trim().length).toBeGreaterThanOrEqual(PREMIUM_USABLE_BODY_MIN_LEN);
    expect(out.proIntentGateMessage).toBeNull();
    expect(out.winningPremiumBodyText).toMatch(/Red Mesa Logistics LLC/i);
    expect(out.winningPremiumBodyText).toMatch(/Harbor Peak Automation LLC/i);
    expect(out.winningPremiumBodyText).toMatch(/Blue Canyon Analytics LLC/i);
    expect(out.winningPremiumBodyText).not.toMatch(/licensing revenue/i);
    expect(out.winningPremiumBodyText).not.toMatch(/information known at intake/i);
  },
    15_000,
  );
});
