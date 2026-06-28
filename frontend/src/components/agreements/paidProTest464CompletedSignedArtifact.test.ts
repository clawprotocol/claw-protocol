/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
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
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { SUBSTANTIVE_SERVER_DRAFT_MIN_LEN } from "./premiumAcceptancePolicy";
import { buildVs01PrepareSigningRolesForBridge } from "./paidProNPartySignerSetup";
import { buildPrepareBridgeCorpusGateArgs } from "../../vs01/vs01PrepareBridgeCorpus";
import { buildVs01SigningPacketModel } from "../../vs01/buildVs01SigningPacketModel";
import { buildFullPacketManifestFromCanonicalModel } from "../../vs01/vs01SigningPacketManifest";
import {
  buildVs01CanonicalPacketPortable,
  buildVs01CanonicalPacketSeed,
} from "../../vs01/vs01CanonicalPacketSeed";
import {
  attachFullyExecutedSnapshotToPortable,
  buildFullyExecutedSignedSnapshot,
  reconstructSignedCorpusFromAuditAndPortable,
  resolveVs01FullyExecutedSignedCorpus,
} from "../../vs01/vs01FullyExecutedSignedSnapshot";
import { countSignedWitnessBlocks, stampWitnessBlockPartySignature, stampWitnessBlockPartySigningDate } from "../../vs01/vs01WitnessBlockSigningDate";
import type { AgreementVs01BridgeSession } from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  buildTest462FrozenHandoffCorpus,
  TEST462_ALL_PARTIES,
  TEST462_LIVE_INTAKE,
  TEST462_SIGNER_METADATA,
  test462BrightPeakFirstDraft,
} from "./paidProTest462Fixtures";

function polishTest464HandoffCorpus(body: string): string {
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

function buildTest464BridgeSession(corpus: string): AgreementVs01BridgeSession {
  return {
    vs01DocumentId: "local_doc_test464",
    agreementId: "ag_test464",
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

function buildSignatureCompletedAuditEvent(args: {
  signerRoleId: string;
  displayName: string;
  signedAt: string;
  signedDateIso: string;
  signedDateDisplay: string;
}) {
  return {
    event_type: "signature_completed",
    at: args.signedAt,
    field: "signature",
    value: {
      signer_role_id: args.signerRoleId,
      participant_display_name: args.displayName,
      signed_date_iso: args.signedDateIso,
      signed_date_display: args.signedDateDisplay,
      document_id: "local_doc_test464",
    },
  };
}

describe("TEST464 — completed signed artifact after four-party VS01 signing", () => {
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

  it("materializes completed signed corpus with all four entity witness blocks and idempotent snapshot", () => {
    const draft = test462BrightPeakFirstDraft();
    const frozenRaw = buildTest462FrozenHandoffCorpus();

    establishPaidProSourceOfTruth({
      text: frozenRaw,
      source: "server_full_draft",
      draft,
      intakeText: TEST462_LIVE_INTAKE,
      reviewSessionId: "gen-test464",
      generationOutcome: "ok",
    });
    const sotHashBefore = getPaidProSourceOfTruth()?.hash ?? "";
    expect(sotHashBefore).toBeTruthy();
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

    const handoffCorpus = polishTest464HandoffCorpus(resolvePaidProPostFinalizeReviewPlain(draft));
    const bridge = buildTest464BridgeSession(handoffCorpus);
    const roles = buildVs01PrepareSigningRolesForBridge(bridge);
    expect(roles.length).toBe(4);

    const roleEntityNames = [...TEST462_ALL_PARTIES];

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

    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles });
    const witnessPageIndex = model.pages.findIndex((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );

    const witnessTail = [
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      ...TEST462_ALL_PARTIES.flatMap((entity) => [
        `${entity}:`,
        "By: ______________________________",
        "Date: ______________________________",
        "",
      ]),
    ].join("\n");
    const signingCorpus = `${"x".repeat(12000)}\n\n${witnessTail}`;
    const signerNames = TEST462_SIGNER_METADATA.partySignerNames;

    let corpusForSigning = signingCorpus;
    for (let i = 0; i < 4; i += 1) {
      const sig = stampWitnessBlockPartySignature(
        corpusForSigning,
        i,
        signerNames[i]!,
        roleEntityNames,
      );
      expect(sig.stamped).toBe(true);
      corpusForSigning = sig.text;
      const dated = stampWitnessBlockPartySigningDate(
        corpusForSigning,
        i,
        `2026-06-${15 + i}`,
        roleEntityNames,
      );
      expect(dated.stamped).toBe(true);
      corpusForSigning = dated.text;
    }

    const seed = buildVs01CanonicalPacketSeed({
      documentId: bridge.vs01DocumentId,
      agreementId: bridge.agreementId,
      corpusPlain: corpusForSigning,
    });
    expect(seed).not.toBeNull();

    let portable = buildVs01CanonicalPacketPortable({
      seed: seed!,
      fields: manifest,
      roles,
      pageCount: model.pages.length,
      witnessPageIndex,
      initialsEnabled: true,
    });

    const auditLog: AgreementDraft["audit_log"] = [];
    for (let i = 0; i < 4; i += 1) {
      const role = roles[i]!;
      const sigField = model.fields.find(
        (f) => f.type === "signature" && !f.autoInitials && f.assignedSignerRoleId === role.roleId,
      );
      if (sigField) {
        portable = {
          ...portable,
          fields: portable.fields.map((f) =>
            f.id === sigField.id ? { ...f, value: signerNames[i]! } : f,
          ),
        };
      }
      auditLog.push(
        buildSignatureCompletedAuditEvent({
          signerRoleId: role.roleId,
          displayName: signerNames[i]!,
          signedAt: `2026-06-${15 + i}T12:00:00.000Z`,
          signedDateIso: `2026-06-${15 + i}`,
          signedDateDisplay: `June ${15 + i}, 2026`,
        }),
      );
    }

    const draftWithAudit = {
      id: bridge.agreementId,
      audit_log: auditLog,
    } as AgreementDraft;

    const stampedCounts = countSignedWitnessBlocks(corpusForSigning, roleEntityNames);
    expect(stampedCounts.signed).toBe(4);
    expect(stampedCounts.total).toBe(4);

    const rebuilt = reconstructSignedCorpusFromAuditAndPortable({
      draft: draftWithAudit,
      portable,
    });
    expect(rebuilt).toBeTruthy();
    expect(rebuilt!.length).toBeGreaterThan(80);

    for (const party of TEST462_ALL_PARTIES) {
      expect(rebuilt!).toContain(party);
    }
    for (const signer of signerNames) {
      expect(rebuilt!).toContain(signer);
    }

    const witnessCounts = countSignedWitnessBlocks(rebuilt!, TEST462_ALL_PARTIES);
    expect(witnessCounts.signed).toBe(4);
    expect(witnessCounts.total).toBe(4);

    const snap = buildFullyExecutedSignedSnapshot({
      ...portable,
      seed: {
        ...portable.seed,
        corpusPlain: rebuilt!,
        corpusHash: fingerprintAgreementBody(rebuilt!),
      },
    });
    expect(snap).not.toBeNull();
    expect(snap!.signerRoleIds.length).toBe(4);

    const portableWithSnap = attachFullyExecutedSnapshotToPortable({
      ...portable,
      seed: portable.seed,
      fullyExecutedSnapshot: snap!,
    });
    const resolved = resolveVs01FullyExecutedSignedCorpus({
      id: bridge.agreementId,
      audit_log: auditLog,
      vs01_signing_packet_v1: {
        v: 1,
        portable: portableWithSnap,
        fully_executed_snapshot: {
          v: 1,
          corpus_plain: snap!.corpusPlain,
          corpus_hash: snap!.corpusHash,
          saved_at: snap!.savedAt,
          signer_role_ids: snap!.signerRoleIds,
        },
      },
    } as unknown as AgreementDraft);
    expect(resolved).not.toBeNull();
    expect(resolved!.source).toBe("fully_executed_snapshot");
    expect(resolved!.text).toContain("Evergreen Outdoor Brands LLC");

    const snapAgain = buildFullyExecutedSignedSnapshot(portableWithSnap);
    expect(snapAgain?.corpusHash).toBe(snap!.corpusHash);

    expect(getPaidProSourceOfTruth()?.hash).toBe(sotHashBefore);
  });
});
