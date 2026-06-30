/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { getFrozenCanonicalAgreementCorpus } from "./canonicalAgreementSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  authorityPartiesToCanonicalPartyIdentities,
} from "./paidProSignerMetadataAuthority";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  evaluatePaidProFreezeCandidateGates,
  preparePaidProFreezeCandidateText,
} from "./paidProFreezeCandidate";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { resolvePaidProSignerFinalizeRawCorpus } from "./paidProSignerFinalizeRawCorpus";
import {
  classifyCompletedVersusFrozenBodyDiff,
  completedCorpusBodyMatchesFrozen,
  extractClauseBodyBeforeWitness,
  normalizeFrozenAgreementBodyForCompare,
} from "./paidProCompletedCorpusFrozenBodyCompare";
import {
  hasMisplacedStandaloneNoticesBeforeSubsection,
  countOperativeIfToNoticeStanzas,
} from "./paidProPartyNoticeDetails";
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
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { markCurrentSessionProEntitlementComplete } from "./paidProSessionEligibility";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
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
import {
  countSignedWitnessBlocks,
  stampWitnessBlockPartySignature,
  stampWitnessBlockPartySigningDate,
} from "../../vs01/vs01WitnessBlockSigningDate";
import type { AgreementVs01BridgeSession } from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  TEST494_INTAKE,
  TEST494_SIGNERS,
  buildTest494ThreePartySection10Corpus,
  test494Draft,
} from "./paidProTest494Fixtures";

function buildTest497BridgeSession(corpus: string): AgreementVs01BridgeSession {
  return {
    vs01DocumentId: "local_doc_test497",
    agreementId: "ag_test497",
    agreementTitle: "Tripartite IP License",
    creatorName: TEST494_SIGNERS[0]!.partyLegalName,
    creatorEmail: TEST494_SIGNERS[0]!.signerEmail,
    creatorSignerName: TEST494_SIGNERS[0]!.signerName,
    creatorSignerTitle: TEST494_SIGNERS[0]!.signerTitle,
    counterparties: TEST494_SIGNERS.slice(1).map((party, i) => ({
      id: `cp${i + 1}`,
      name: party.partyLegalName,
      email: party.signerEmail,
      signerName: party.signerName,
      signerTitle: party.signerTitle,
    })),
    targetStep: 2,
    senderFirstLawdogHandoff: true,
    reviewerApprovedCleanHandoff: true,
    agreementBridgeMode: "prepare_signing_packet",
    ownerIsPreparingPacket: true,
    agreementCorpusText: corpus,
    creatorIsParty: true,
  };
}

function signatureCompletedAuditEvent(args: {
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
      document_id: "local_doc_test497",
    },
  };
}

describe("TEST497 — completed PDF / view-signed body matches frozen corpus (execution overlay only)", () => {
  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    markCurrentSessionProEntitlementComplete();
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

  it("resolveVs01FullyExecutedSignedCorpus preserves frozen clause body through signing completion", () => {
    const intake = TEST494_INTAKE;
    const draft = test494Draft();
    const raw = buildTest494ThreePartySection10Corpus();
    const preview = preparePaidProServerDocumentForAcceptance(raw, draft, intake).text;
    const prep = preparePaidProFreezeCandidateText({
      text: preview,
      intakeText: intake,
      draft,
      source: "server_full_draft",
    });
    const freezeGated = evaluatePaidProFreezeCandidateGates(prep, {
      text: preview,
      intakeText: intake,
      draft,
      source: "server_full_draft",
    });
    expect(freezeGated.ok).toBe(true);

    markPaidProPipelineValidationPassed({ text: freezeGated.text, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: freezeGated.text,
      source: "server_full_draft",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });
    const frozen =
      getFrozenCanonicalAgreementCorpus()?.canonicalText ?? getPaidProSourceOfTruthText();
    expect(hasMisplacedStandaloneNoticesBeforeSubsection(frozen)).toBe(false);
    expect(countOperativeIfToNoticeStanzas(frozen)).toBe(3);

    const review = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    expect(completedCorpusBodyMatchesFrozen(review, frozen)).toBe(true);

    const authority = {
      parties: TEST494_SIGNERS.map((party, partyIndex) => ({ ...party, partyIndex })),
      source: "live_ui" as const,
      hash: "test497",
      updatedAt: Date.now(),
    };
    setConsumedPaidProSignerMetadataAuthority(authority);

    const rawResolution = resolvePaidProSignerFinalizeRawCorpus({
      authoritativePaidProReviewPlain: frozen,
      immutableSourceOfTruthOnly: true,
    });
    expect(rawResolution.source).toBe("paid_pro_source_of_truth");

    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: rawResolution.corpus,
      authority,
      intakeRaw: intake,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    expect(hydrated.rejected).not.toBe(true);

    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: authorityPartiesToCanonicalPartyIdentities(authority.parties),
        signFirst: true,
      }),
      intakeText: intake,
      authorityParties: authority.parties,
      replaceExisting: true,
      preserveFrozenServerFullHydratedCorpus: true,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);

    const bridge = buildTest497BridgeSession(frozen);
    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: bridge.agreementId,
      creatorName: bridge.creatorName,
      creatorEmail: bridge.creatorEmail,
      ownerSignerName: bridge.creatorSignerName,
      ownerSignerTitle: bridge.creatorSignerTitle,
      counterparties: bridge.counterparties ?? [],
      bridge,
    });
    expect(roles).toHaveLength(3);

    const roleEntityNames = TEST494_SIGNERS.map((p) => p.partyLegalName);
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: frozen,
      roles,
      initialsEnabled: false,
      bridge,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({
        agreementCorpusText: frozen,
        bridge,
      }),
    });
    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles });
    const witnessPageIndex = model.pages.findIndex((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );

    const clauseBody = extractClauseBodyBeforeWitness(frozen);
    const witnessTail = [
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      ...roleEntityNames.flatMap((entity) => [
        `${entity}:`,
        "By: ______________________________",
        "Date: ______________________________",
        "",
      ]),
    ].join("\n");
    let signingCorpus = `${clauseBody}\n\n${witnessTail}`;

    for (let i = 0; i < 3; i += 1) {
      const sig = stampWitnessBlockPartySignature(
        signingCorpus,
        i,
        TEST494_SIGNERS[i]!.signerName,
        roleEntityNames,
      );
      expect(sig.stamped).toBe(true);
      signingCorpus = sig.text;
      const dated = stampWitnessBlockPartySigningDate(
        signingCorpus,
        i,
        `2026-06-${15 + i}`,
        roleEntityNames,
      );
      expect(dated.stamped).toBe(true);
      signingCorpus = dated.text;
    }

    const seed = buildVs01CanonicalPacketSeed({
      documentId: bridge.vs01DocumentId,
      agreementId: bridge.agreementId,
      corpusPlain: signingCorpus,
    });
    expect(seed).not.toBeNull();

    let portable = buildVs01CanonicalPacketPortable({
      seed: seed!,
      fields: manifest,
      roles,
      pageCount: model.pages.length,
      witnessPageIndex,
      initialsEnabled: false,
    });

    const auditLog: AgreementDraft["audit_log"] = [];
    for (let i = 0; i < 3; i += 1) {
      const role = roles[i]!;
      const sigField = model.fields.find(
        (f) => f.type === "signature" && !f.autoInitials && f.assignedSignerRoleId === role.roleId,
      );
      if (sigField) {
        portable = {
          ...portable,
          fields: portable.fields.map((f) =>
            f.id === sigField.id ? { ...f, value: TEST494_SIGNERS[i]!.signerName } : f,
          ),
        };
      }
      auditLog.push(
        signatureCompletedAuditEvent({
          signerRoleId: role.roleId,
          displayName: TEST494_SIGNERS[i]!.signerName,
          signedAt: `2026-06-${15 + i}T12:00:00.000Z`,
          signedDateIso: `2026-06-${15 + i}`,
          signedDateDisplay: `June ${15 + i}, 2026`,
        }),
      );
    }

    const rebuilt = reconstructSignedCorpusFromAuditAndPortable({
      draft: { id: bridge.agreementId, audit_log: auditLog } as AgreementDraft,
      portable,
    });
    expect(rebuilt).toBeTruthy();

    const snap = buildFullyExecutedSignedSnapshot({
      ...portable,
      seed: {
        ...portable.seed,
        corpusPlain: rebuilt!,
        corpusHash: fingerprintAgreementBody(rebuilt!),
      },
    });
    expect(snap).not.toBeNull();

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

    const completedText = resolved!.text;
    expect(classifyCompletedVersusFrozenBodyDiff(completedText, frozen)).toBe("execution_overlay_only");
    expect(completedCorpusBodyMatchesFrozen(completedText, frozen)).toBe(true);
    expect(extractClauseBodyBeforeWitness(completedText)).toBe(extractClauseBodyBeforeWitness(frozen));
    expect(hasMisplacedStandaloneNoticesBeforeSubsection(completedText)).toBe(false);
    expect(countOperativeIfToNoticeStanzas(completedText)).toBe(3);
    expect(normalizeFrozenAgreementBodyForCompare(completedText)).toBe(
      normalizeFrozenAgreementBodyForCompare(frozen),
    );

    const witnessCounts = countSignedWitnessBlocks(completedText, roleEntityNames);
    expect(witnessCounts.signed).toBe(3);
    expect(getPaidProSourceOfTruth()?.text).toBe(frozen);
  });
});
