import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { freezeCanonicalAgreementSnapshot, clearFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { buildCanonicalAgreementSnapshot } from "./canonicalAgreementSnapshot";
import { analyzePaidProExecutionBlockInvariant } from "./paidProExecutionBlockAuthority";
import {
  assertPaidProSignerFinalizeNoSubstantiveClauseDrift,
  auditPaidProCorpusLifecycleFromCheckpoint,
  buildPaidProCorpusLifecycleDiffPayload,
  classifyPaidProCorpusLifecycleDiff,
  readPaidProCorpusLifecycleCheckpoint,
  recordPaidProCorpusLifecycleCheckpoint,
  resetPaidProCorpusLifecycleDiffForTests,
} from "./paidProCorpusLifecycleDiff";
import {
  applyPremiumRecipientHandoffReadGate,
  readPaidProHandoffReadGateStateForTests,
  resetPaidProPremiumRecipientHandoffReadGateForTests,
} from "./paidProPremiumRecipientHandoffReadGate";
import {
  resetPremiumRecipientHandoffDedupForTests,
  type PremiumRecipientHandoffV2,
} from "./premiumPartyNamesHandoff";
import {
  recordPaidProReviewRender,
  resetPaidProReviewStabilityForTests,
  shouldSkipPaidProPaymentScrollResetForCorpus,
} from "./paidProReviewStability";
import {
  establishPaidProSourceOfTruth,
  clearPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
} from "./paidProSourceOfTruth";
import { buildLivePaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resetPaidProReviewSignerMetadataSessionActiveForTests } from "./paidProReviewRenderSessionGate";
import { setConsumedPaidProSignerMetadataAuthority, clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

const FREEZE_BODY = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
  "",
  ...Array.from({ length: 18 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  BLUE,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "",
  "SERVICE PROVIDER:",
  IRON,
  "By: _________________________________",
  "Name:",
  "Title:",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
].join("\n");

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "anthemhayek@gmail.com",
    recipient2Email: "ivee23@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Anthem H Blanchard", "Ivan Vee"],
    partySignerTitles: ["Member", "Manager"],
    partyAddresses: ["1027 S. Rainbow Blvd.", "138 Main St."],
  });
}

function armBlueCanyonSoT() {
  const draft = {
    title: "Consulting Agreement",
    parties: [
      { name: BLUE, role: "Client" },
      { name: IRON, role: "Service Provider" },
    ],
  } as ParsedDraftShape;
  establishPaidProSourceOfTruth({
    text: FREEZE_BODY,
    source: "server_full_draft",
    draft,
    intakeText: "consulting between Blue Canyon and Iron Vale",
  });
  return draft;
}

describe("paidPro Test270 corpus diff / handoff / scroll", () => {
  beforeEach(() => {
    resetPaidProCorpusLifecycleDiffForTests();
    resetPaidProPremiumRecipientHandoffReadGateForTests();
    resetPremiumRecipientHandoffDedupForTests();
    resetPaidProReviewStabilityForTests();
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
    resetPaidProReviewSignerMetadataSessionActiveForTests();
  });

  it("classifies signer finalize drift as signer_metadata_only without substantive clause delta", () => {
    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "test270",
      signatureRegionOnly: true,
    });
    const classification = classifyPaidProCorpusLifecycleDiff(FREEZE_BODY, hydrated.corpus);
    expect(classification).toBe("signer_metadata_only");
    assertPaidProSignerFinalizeNoSubstantiveClauseDrift(FREEZE_BODY, hydrated.corpus);
    expect(analyzePaidProExecutionBlockInvariant(hydrated.corpus).executionBlockCount).toBe(1);
    expect(FREEZE_BODY.slice(0, FREEZE_BODY.indexOf("IN WITNESS"))).toBe(
      hydrated.corpus.slice(0, hydrated.corpus.indexOf("IN WITNESS")),
    );
  });

  it("logs lifecycle checkpoints canonical_freeze → signer_finalize", () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const snap = buildCanonicalAgreementSnapshot({
      surface: "test270",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: FREEZE_BODY }],
      parties: [
        { name: BLUE, role: "Client" },
        { name: IRON, role: "Service Provider" },
      ],
      minLen: 500,
    });
    freezeCanonicalAgreementSnapshot(snap, "server_full_document_text");
    expect(readPaidProCorpusLifecycleCheckpoint("canonical_freeze")?.hash).toBeTruthy();

    const authority = qaAuthority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "test270_finalize",
      signatureRegionOnly: true,
    });
    auditPaidProCorpusLifecycleFromCheckpoint({
      fromStage: "canonical_freeze",
      toStage: "signer_finalize",
      afterText: hydrated.corpus,
    });

    const finalizeDiffs = info.mock.calls.filter((c) => c[0] === "[paid-pro-corpus-diff]");
    expect(finalizeDiffs.length).toBe(1);
    expect(finalizeDiffs[0]?.[1]).toMatchObject({
      fromStage: "canonical_freeze",
      toStage: "signer_finalize",
      classification: "signer_metadata_only",
      substantiveClauseDelta: false,
      executionBlockCountAfter: 1,
    });
    info.mockRestore();
    vi.unstubAllEnvs();
  });

  it("Blue Canyon fixture: review and copy share hash; signer finalize explains drift", () => {
    armBlueCanyonSoT();
    recordPaidProCorpusLifecycleCheckpoint("canonical_freeze", FREEZE_BODY);
    const authority = qaAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: FREEZE_BODY,
      authority,
      intakeRaw: "",
      surface: "test270",
      signatureRegionOnly: true,
    });
    auditPaidProCorpusLifecycleFromCheckpoint({
      fromStage: "canonical_freeze",
      toStage: "signer_finalize",
      afterText: hydrated.corpus,
    });
    const review = getPaidProDocumentForSurface("review")!;
    const copy = getPaidProDocumentForSurface("copy")!;
    expect(review.hash).toBe(copy.hash);
    const payload = buildPaidProCorpusLifecycleDiffPayload({
      fromStage: "canonical_freeze",
      toStage: "signer_finalize",
      beforeText: FREEZE_BODY,
      afterText: hydrated.corpus,
    });
    expect(payload.substantiveClauseDelta).toBe(false);
    expect(payload.executionBlockCountAfter).toBe(1);
  });

  it("does not replace populated handoff with empty signer read for same parties", () => {
    const populated: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: {
        name: BLUE,
        email: "a@test.com",
        role: "client",
        signerName: "Anthem H Blanchard",
        signerTitle: "Member",
        partyAddress: "1027 S. Rainbow Blvd.",
      },
      party2: {
        name: IRON,
        email: "b@test.com",
        role: "service provider",
        signerName: "Ivan Vee",
        signerTitle: "Manager",
        partyAddress: "138 Main St.",
      },
      savedAt: Date.now(),
    };
    applyPremiumRecipientHandoffReadGate(populated, { partySlotCount: 2 });
    const emptyRead: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: { name: BLUE, email: "a@test.com", role: "client", signerName: "", signerTitle: "" },
      party2: { name: IRON, email: "b@test.com", role: "service provider", signerName: "", signerTitle: "" },
      savedAt: Date.now(),
    };
    const gated = applyPremiumRecipientHandoffReadGate(emptyRead, { partySlotCount: 2 });
    expect(gated?.party1.signerName).toBe("Anthem H Blanchard");
    expect(gated?.party2.signerName).toBe("Ivan Vee");
    expect(readPaidProHandoffReadGateStateForTests().sessionEverHadPopulatedHandoff).toBe(true);
  });

  it("allows empty handoff read for genuinely new session", () => {
    const emptyRead: PremiumRecipientHandoffV2 = {
      v: 2,
      party1: { name: "New Co", email: "", role: "client", signerName: "", signerTitle: "" },
      party2: { name: "Other Co", email: "", role: "provider", signerName: "", signerTitle: "" },
      savedAt: Date.now(),
    };
    const gated = applyPremiumRecipientHandoffReadGate(emptyRead, { partySlotCount: 2 });
    expect(gated?.party1.signerName).toBe("");
  });

  it("preserves scroll for signer_metadata_only when review surface already mounted", () => {
    recordPaidProReviewRender(FREEZE_BODY);
    expect(
      shouldSkipPaidProPaymentScrollResetForCorpus({
        corpusTransitionClassification: "signer_metadata_only",
        corpusHashUnchanged: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipPaidProPaymentScrollResetForCorpus({
        corpusTransitionClassification: "substantive_clause_change",
        corpusHashUnchanged: false,
      }),
    ).toBe(false);
  });

  it("dedupes identical paid-pro-corpus-diff logs", () => {
    vi.stubEnv("VITE_PAID_PRO_PERF_TRACE", "1");
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    auditPaidProCorpusLifecycleFromCheckpoint({
      fromStage: "canonical_freeze",
      toStage: "signer_finalize",
      afterText: FREEZE_BODY.replace("Name:", "Name: Jane"),
    });
    recordPaidProCorpusLifecycleCheckpoint("canonical_freeze", FREEZE_BODY);
    auditPaidProCorpusLifecycleFromCheckpoint({
      fromStage: "canonical_freeze",
      toStage: "signer_finalize",
      afterText: FREEZE_BODY.replace("Name:", "Name: Jane"),
    });
    const diffs = info.mock.calls.filter((c) => c[0] === "[paid-pro-corpus-diff]");
    expect(diffs).toHaveLength(1);
    info.mockRestore();
    vi.unstubAllEnvs();
  });
});
