/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
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
import {
  repairJoinedTopLevelSectionHeadings,
  applySectionStructureIntegrity,
} from "./sectionStructureAuthority";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
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
  signingPacketHasVisibleText,
} from "../../vs01/vs01CanonicalPageRender";
import { Vs01CanonicalSigningPage } from "../../vs01/Vs01CanonicalSigningPage";
import type { AgreementVs01BridgeSession } from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  buildTest461FrozenHandoffCorpus,
  TEST461_ALL_PARTIES,
  TEST461_LIVE_INTAKE,
  TEST461_MIN_FROZEN_LEN,
  TEST461_SIGNER_METADATA,
  test461BrightPeakFirstDraft,
} from "./paidProTest461Vs01PreparePacketFixtures";

function polishTest461ReviewCorpus(body: string): string {
  const joined = repairJoinedTopLevelSectionHeadings(body);
  const notices = repairBareEntityOnlyNoticeStanzas(joined.text);
  const display = preparePaidProReviewDisplayPlain(notices.text);
  return polishProAgreementDisplayLayer(display.text, {
    draft: test461BrightPeakFirstDraft(),
    intakeText: TEST461_LIVE_INTAKE,
    reviewDisplayMode: true,
    retainSignatureExecutionBlock: true,
  }).text;
}

function buildTest461BridgeSession(corpus: string): AgreementVs01BridgeSession {
  return {
    vs01DocumentId: "local_doc_test461",
    agreementId: "ag_test461",
    agreementTitle: "Manufacturing, Distribution, Licensing and Marketing Services Agreement",
    creatorName: TEST461_ALL_PARTIES[0]!,
    creatorEmail: TEST461_SIGNER_METADATA.recipient1Email,
    creatorSignerName: TEST461_SIGNER_METADATA.partySignerNames[0]!,
    creatorSignerTitle: TEST461_SIGNER_METADATA.partySignerTitles[0]!,
    counterparties: [
      {
        id: "cp1",
        name: TEST461_ALL_PARTIES[1]!,
        email: TEST461_SIGNER_METADATA.recipient2Email,
        signerName: TEST461_SIGNER_METADATA.partySignerNames[1]!,
        signerTitle: TEST461_SIGNER_METADATA.partySignerTitles[1]!,
      },
      {
        id: "cp2",
        name: TEST461_ALL_PARTIES[2]!,
        email: TEST461_SIGNER_METADATA.extraPartyReviewEmails[0]!,
        signerName: TEST461_SIGNER_METADATA.partySignerNames[2]!,
        signerTitle: TEST461_SIGNER_METADATA.partySignerTitles[2]!,
      },
      {
        id: "cp3",
        name: TEST461_ALL_PARTIES[3]!,
        email: TEST461_SIGNER_METADATA.extraPartyReviewEmails[1]!,
        signerName: TEST461_SIGNER_METADATA.partySignerNames[3]!,
        signerTitle: TEST461_SIGNER_METADATA.partySignerTitles[3]!,
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

describe("TEST461 — VS01 prepare packet render after frozen server_full SoT handoff", () => {
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

  it("repairs venue.12.4 Notices joined subsection heading on display path", () => {
    const raw =
      "Each party consents to that jurisdiction and venue.12.4 Notices must be delivered in writing.";
    const structure = applySectionStructureIntegrity(raw, {
      source: "test461_display",
      repair: true,
    });
    expect(structure.text).toContain("venue.\n\n12.4 Notices");
    expect(structure.text).not.toMatch(/venue\.12\.4 Notices/);
  });

  it("frozen outdoor-products handoff yields VS01 packetReady without canonical_text_not_rendered", () => {
    const draft = test461BrightPeakFirstDraft();
    const frozenRaw = buildTest461FrozenHandoffCorpus();
    expect(frozenRaw.length).toBeGreaterThanOrEqual(TEST461_MIN_FROZEN_LEN);
    expect(frozenRaw).toMatch(/venue\.12\.4 Notices/i);

    const polished = polishTest461ReviewCorpus(frozenRaw);
    expect(polished.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(polished).not.toMatch(/venue\.12\.4 Notices/);

    establishPaidProSourceOfTruth({
      text: polished,
      source: "server_full_draft",
      draft,
      intakeText: TEST461_LIVE_INTAKE,
      reviewSessionId: "gen-test461",
      generationOutcome: "ok",
    });
    const sotLen = getPaidProSourceOfTruthText().length;
    expect(sotLen).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);

    const authority = buildLivePaidProSignerMetadataAuthority(TEST461_SIGNER_METADATA);
    setConsumedPaidProSignerMetadataAuthority(authority);

    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: getPaidProSourceOfTruthText(),
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: TEST461_LIVE_INTAKE,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);

    const partyManifest = buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: TEST461_LIVE_INTAKE,
      draftPartyNames: TEST461_ALL_PARTIES,
    });
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest,
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
      intakeText: TEST461_LIVE_INTAKE,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: true,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);

    const handoffCorpus = resolvePaidProPostFinalizeReviewPlain(draft);
    expect(handoffCorpus.length).toBeGreaterThan(SUBSTANTIVE_SERVER_DRAFT_MIN_LEN);
    expect(countPaidProExecutionBlocks(handoffCorpus)).toBe(1);
    expect(handoffCorpus).toMatch(/MANUFACTURING, DISTRIBUTION, LICENSING AND MARKETING SERVICES AGREEMENT/i);
    expect(handoffCorpus).not.toMatch(/^SERVICES AGREEMENT/m);
    expect(handoffCorpus).not.toMatch(/structural_recovery/i);

    const bridge = buildTest461BridgeSession(handoffCorpus);
    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: bridge.agreementId,
      creatorName: bridge.creatorName,
      creatorEmail: bridge.creatorEmail,
      ownerSignerName: bridge.creatorSignerName,
      ownerSignerTitle: bridge.creatorSignerTitle,
      counterparties: bridge.counterparties,
      bridge,
    });
    expect(roles).toHaveLength(4);

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: handoffCorpus,
      roles,
      initialsEnabled: false,
      bridge,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({
        agreementCorpusText: handoffCorpus,
        bridge,
      }),
    });

    expect(model.pages.length).toBeGreaterThan(0);
    expect(signingPacketHasVisibleText(model.pages)).toBe(true);
    expect(signingPacketHasPaginatedCorpus(model)).toBe(true);

    const canonicalTextRendered = resolveVs01CanonicalBridgeTextRendered({
      bridgeMode: true,
      signingPacketModel: model,
      corpusGateAllowed: model.diagnostics.corpusGate.allowed,
      corpusTextLen: handoffCorpus.length,
    });
    expect(canonicalTextRendered).toBe(true);
    expect(
      formatVs01PacketReadyDebugLabel(
        resolveVs01PreparePacketReadiness({
          corpusGate: model.diagnostics.corpusGate,
          placementCanFinish: false,
          initialsSummary: null,
          canonicalTextRendered: false,
          canonicalSignatureLinesRendered: true,
        }).reason,
      ),
    ).toBe("canonical_text_not_rendered");

    const canonicalSignatureLinesRendered = resolveVs01CanonicalBridgeSignatureLinesRendered({
      bridgeMode: true,
      signingPacketModel: model,
      roleCount: roles.length,
    });
    expect(canonicalSignatureLinesRendered).toBe(
      model.diagnostics.signatureAnchorCount >= roles.length ||
        model.fields.filter((f) => f.type === "signature" && !f.autoInitials).length >= roles.length,
    );

    const bridgeSignatureFields = model.fields.filter((f) => f.type === "signature" && !f.autoInitials);
    const placementCanFinish =
      bridgeSignatureFields.length >= roles.length ||
      model.diagnostics.signatureAnchorCount >= roles.length;
    const readiness = resolveVs01PreparePacketReadiness({
      corpusGate: model.diagnostics.corpusGate,
      placementCanFinish,
      initialsSummary: null,
      canonicalTextRendered,
      canonicalSignatureLinesRendered:
        canonicalSignatureLinesRendered ?? model.diagnostics.signatureAnchorCount > 0,
    });
    expect(readiness.reason).not.toBe("canonical_page_text_not_rendered");
    expect(formatVs01PacketReadyDebugLabel(readiness.reason)).not.toBe("canonical_text_not_rendered");
    if (placementCanFinish) {
      expect(readiness.packetReady).toBe(true);
      expect(readiness.reason).toBeNull();
    }

    const firstPage = model.pages[0]!;
    const { container } = render(<Vs01CanonicalSigningPage page={firstPage} pageWidthPx={612} />);
    expect(container.querySelectorAll("[data-vs01-canonical-text]").length).toBeGreaterThan(0);
    expect(container.textContent?.length ?? 0).toBeGreaterThan(40);
  });
});
