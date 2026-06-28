/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToRecipientMetadata,
  buildLivePaidProSignerMetadataAuthority,
  buildCanonicalFinalPartyManifestFromAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";
import { preparePaidProReviewDisplayPlain } from "./paidProFlattenedDocumentNormalize";
import { repairBareEntityOnlyNoticeStanzas } from "./paidProPartyNoticeDetails";
import { repairJoinedTopLevelSectionHeadings } from "./sectionStructureAuthority";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { setPaidProPinnedSignerAppliedCorpus, clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { buildVs01PrepareSigningRolesForBridge } from "./paidProNPartySignerSetup";
import { buildPrepareBridgeCorpusGateArgs } from "../../vs01/vs01PrepareBridgeCorpus";
import { buildVs01SigningPacketModel } from "../../vs01/buildVs01SigningPacketModel";
import {
  formatVs01PacketReadyDebugLabel,
  resolveVs01PreparePacketReadiness,
} from "../../vs01/vs01PreparePacketReadiness";
import {
  resolveVs01CanonicalBridgeSignatureLinesRendered,
  resolveVs01CanonicalBridgeTextRendered,
  signingPacketHasPaginatedCorpus,
} from "../../vs01/vs01CanonicalPageRender";
import type { AgreementVs01BridgeSession } from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  buildTest462FrozenHandoffCorpus,
  TEST462_ALL_PARTIES,
  TEST462_LIVE_INTAKE,
  TEST462_SIGNER_METADATA,
  test462BrightPeakFirstDraft,
} from "./paidProTest462Fixtures";

function polishTest463HandoffCorpus(body: string): string {
  const joined = repairJoinedTopLevelSectionHeadings(body);
  const notices = repairBareEntityOnlyNoticeStanzas(joined.text);
  const display = preparePaidProReviewDisplayPlain(notices.text);
  return polishProAgreementDisplayLayer(display.text, {
    draft: test462BrightPeakFirstDraft(),
    intakeText: TEST462_LIVE_INTAKE,
    reviewDisplayMode: true,
    retainSignatureExecutionBlock: true,
  }).text;
}

function buildTest463BridgeSession(corpus: string): AgreementVs01BridgeSession {
  return {
    vs01DocumentId: "local_doc_test463",
    agreementId: "ag_test463",
    agreementTitle: "Manufacturing, Distribution, Licensing and Marketing Services Agreement",
    creatorName: TEST462_ALL_PARTIES[0]!,
    creatorEmail: TEST462_SIGNER_METADATA.recipient1Email,
    creatorSignerName: TEST462_SIGNER_METADATA.partySignerNames[0]!,
    creatorSignerTitle: TEST462_SIGNER_METADATA.partySignerTitles[0]!,
    counterparties: [
      {
        id: "cp1",
        name: TEST462_ALL_PARTIES[1]!,
        email: TEST462_SIGNER_METADATA.recipient2Email,
        signerName: TEST462_SIGNER_METADATA.partySignerNames[1]!,
        signerTitle: TEST462_SIGNER_METADATA.partySignerTitles[1]!,
      },
      {
        id: "cp2",
        name: TEST462_ALL_PARTIES[2]!,
        email: TEST462_SIGNER_METADATA.extraPartyReviewEmails[0]!,
        signerName: TEST462_SIGNER_METADATA.partySignerNames[2]!,
        signerTitle: TEST462_SIGNER_METADATA.partySignerTitles[2]!,
      },
      {
        id: "cp3",
        name: TEST462_ALL_PARTIES[3]!,
        email: TEST462_SIGNER_METADATA.extraPartyReviewEmails[1]!,
        signerName: TEST462_SIGNER_METADATA.partySignerNames[3]!,
        signerTitle: TEST462_SIGNER_METADATA.partySignerTitles[3]!,
      },
    ],
    targetStep: 2,
    senderFirstLawdogHandoff: true,
    reviewerApprovedCleanHandoff: true,
    agreementBridgeMode: "prepare_signing_packet",
    ownerIsPreparingPacket: true,
    agreementCorpusText: corpus,
  };
}

describe("TEST463 — VS01 four-party Paid Pro signature field readiness", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  it("generates four signature fields and unlocks packet readiness for entity-name execution block", () => {
    const draft = test462BrightPeakFirstDraft();
    const frozenRaw = buildTest462FrozenHandoffCorpus();

    establishPaidProSourceOfTruth({
      text: frozenRaw,
      source: "server_full_draft",
      draft,
      intakeText: TEST462_LIVE_INTAKE,
      reviewSessionId: "gen-test463",
      generationOutcome: "ok",
    });
    const sotHash = getPaidProSourceOfTruth()?.hash ?? "";
    expect(sotHash).toBeTruthy();
    expect(getPaidProSourceOfTruthText().length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);

    const authority = buildLivePaidProSignerMetadataAuthority(TEST462_SIGNER_METADATA);
    setConsumedPaidProSignerMetadataAuthority(authority);

    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: getPaidProSourceOfTruthText(),
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: TEST462_LIVE_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);

    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: TEST462_LIVE_INTAKE,
      draftPartyNames: TEST462_ALL_PARTIES,
    });
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest,
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
      intakeText: TEST462_LIVE_INTAKE,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: true,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);

    const handoffCorpus = polishTest463HandoffCorpus(resolvePaidProPostFinalizeReviewPlain(draft));
    expect(handoffCorpus).toContain("Ann Center");
    expect(handoffCorpus).toContain("Hans Wiener");
    expect(handoffCorpus).toContain("Benton Reese");
    expect(handoffCorpus).toContain("Eve Green");

    const bridge = buildTest463BridgeSession(handoffCorpus);
    const roles = buildVs01PrepareSigningRolesForBridge(bridge);
    expect(roles.length).toBe(4);

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: handoffCorpus,
      roles,
      initialsEnabled: true,
      bridge,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({
        agreementCorpusText: handoffCorpus,
        bridge,
      }),
    });

    expect(model.pages.length).toBeGreaterThanOrEqual(16);
    expect(model.pages.length).toBeLessThanOrEqual(18);

    const signatureFields = model.fields.filter((f) => f.type === "signature" && !f.autoInitials);
    expect(signatureFields.length).toBeGreaterThanOrEqual(4);
    expect(model.diagnostics.signatureAnchorCount).toBeGreaterThanOrEqual(4);
    expect(model.diagnostics.expectedSignerCount).toBe(4);
    expect(model.diagnostics.missingSignaturePartyIndices ?? []).toEqual([]);

    const partyIndices = signatureFields.map((f) => f.assignedPartyIndex ?? -1).sort((a, b) => a - b);
    expect(partyIndices).toEqual([0, 1, 2, 3]);
    expect(new Set(partyIndices).size).toBe(4);

    const canonicalTextRendered = resolveVs01CanonicalBridgeTextRendered({
      bridgeMode: true,
      signingPacketModel: model,
      corpusGateAllowed: model.diagnostics.corpusGate.allowed,
      corpusTextLen: handoffCorpus.length,
    });
    const canonicalSignatureLinesRendered = resolveVs01CanonicalBridgeSignatureLinesRendered({
      bridgeMode: true,
      signingPacketModel: model,
      roleCount: roles.length,
    });
    expect(signingPacketHasPaginatedCorpus(model)).toBe(true);
    expect(canonicalTextRendered).toBe(true);
    expect(canonicalSignatureLinesRendered).toBe(true);

    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: model.diagnostics.corpusGate,
      placementCanFinish: signatureFields.length >= roles.length,
      initialsSummary: { complete: true, unsafeInitialsCount: 0, unsafeSignatureCount: 0 },
      canonicalTextRendered,
      canonicalSignatureLinesRendered,
    });
    expect(readiness.packetReady).toBe(true);
    expect(readiness.reason).toBeNull();
    expect(formatVs01PacketReadyDebugLabel(readiness.reason)).toBeNull();
    expect(formatVs01PacketReadyDebugLabel("canonical_signature_lines_not_rendered")).toBe(
      "canonical_signature_lines_missing",
    );

    expect(getPaidProSourceOfTruth()?.hash).toBe(sotHash);
  });
});
