/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import { sanitizeCanonicalPartyAddress } from "./canonicalPartyStructuredAddress";
import {
  alignIntakeSignerMetadataToLegalEntities,
  authorityPartiesFromIntakeSignerMetadata,
  countIntakeSignerMetadataSlots,
  extractCanonicalIntakeSignerMetadata,
} from "./intakeSignerMetadataAuthority";
import { parseAllStructuredPartyContactBlocks, parseLabeledPartyBlocks } from "./labeledPartyBlockParse";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  ensureOperativeIfToNoticeDelivery,
  extractPartyAddressesFromOperativeNoticeStanzas,
  hasBareEntityOnlyNoticeStanzas,
  noticeStanzaHasAddressPollution,
  repairIncompleteIfToNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { evaluateProfessionalCorpusContamination } from "./paidProProfessionalCorpusContamination";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffFromAuthorityParties,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import {
  assertAuthorityPartiesMetadata,
  assertCanonicalPartyCount,
  assertCorpusNPartyStructure,
  assertHandoffSlotIntegrity,
  countPartyBlocksInExecutionTail,
  executionTail,
} from "./paidProTest423Helpers";
import {
  TEST487_ADDRESS_CONTAMINATION_MARKERS,
  TEST487_COASTAL,
  TEST487_FOUR_PARTY,
  TEST487_FOUR_PARTY_LEGAL_ENTITIES,
  TEST487_LUMEN,
  TEST487_THALASSA,
  TEST487_VANGUARD,
  TEST487_FORBIDDEN_ENTITY_MARKERS,
  TEST487_MAILING_ADDRESSES,
  TEST487_NOTICE_ADDRESSES,
  TEST487_PARTY_EMAILS,
  TEST487_PRODUCTION_INTAKE,
  TEST487_SIGNER_NAMES,
  buildTest487AcceptedCorpus,
  buildTest487OperativeNoticeCorpus,
  test487DraftWithFourParsedParties,
  test487LiveUiWithBlankExtraLegalNames,
  test487PartiesFromFinalizeUi,
} from "./paidProTest487ProductionValidationFixtures";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
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
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import type { AgreementDraft } from "../../agreement/agreementTypes";

function assertNoForbiddenEntityAuthority(
  stage: string,
  parties: readonly PaidProSignerMetadataParty[],
): void {
  for (const marker of TEST487_FORBIDDEN_ENTITY_MARKERS) {
    for (const p of parties) {
      expect(p.partyLegalName.toUpperCase(), `${stage}: forbidden entity ${marker}`).not.toContain(
        marker,
      );
    }
  }
}

function assertPartyAlignment(stage: string, parties: readonly PaidProSignerMetadataParty[]): void {
  expect(parties.length, `${stage}: party count`).toBe(4);
  for (let i = 0; i < 4; i += 1) {
    const p = parties[i]!;
    const entity = TEST487_FOUR_PARTY[i]!.legalEntity;
    expect(p.partyLegalName, `${stage}: party ${i} entity`).toContain(
      entity.replace(/\.$/, "").split(" ")[0]!,
    );
    expect(p.signerName, `${stage}: party ${i} signer`).toBe(TEST487_SIGNER_NAMES[i]);
    expect(p.signerTitle, `${stage}: party ${i} title`).toBe(TEST487_FOUR_PARTY[i]!.signerTitle);
    expect(p.signerEmail, `${stage}: party ${i} email`).toBe(TEST487_PARTY_EMAILS[i]);
    expect(p.partyLegalName, `${stage}: entity≠signer ${i}`).not.toBe(p.signerName);
  }
}

function buildTest487BridgeSession(corpus: string): AgreementVs01BridgeSession {
  const ui = test487LiveUiWithBlankExtraLegalNames();
  return {
    vs01DocumentId: "local_doc_test487",
    agreementId: "ag_test487",
    agreementTitle: "Precision Medicine Data Platform Agreement",
    creatorName: TEST487_FOUR_PARTY[0]!.legalEntity,
    creatorEmail: ui.recipient1Email,
    creatorSignerName: ui.partySignerNames[0]!,
    creatorSignerTitle: ui.partySignerTitles[0]!,
    counterparties: [
      {
        id: "cp1",
        name: TEST487_FOUR_PARTY[1]!.legalEntity,
        email: ui.recipient2Email,
        signerName: ui.partySignerNames[1]!,
        signerTitle: ui.partySignerTitles[1]!,
      },
      {
        id: "cp2",
        name: TEST487_FOUR_PARTY[2]!.legalEntity,
        email: ui.extraPartyReviewEmails[0]!,
        signerName: ui.partySignerNames[2]!,
        signerTitle: ui.partySignerTitles[2]!,
      },
      {
        id: "cp3",
        name: TEST487_FOUR_PARTY[3]!.legalEntity,
        email: ui.extraPartyReviewEmails[1]!,
        signerName: ui.partySignerNames[3]!,
        signerTitle: ui.partySignerTitles[3]!,
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

function signatureCompletedEvent(
  partyIndex: number,
  roleId: string,
): AgreementDraft["audit_log"][number] {
  const party = TEST487_FOUR_PARTY[partyIndex]!;
  return {
    event_type: "signature_completed",
    at: `2026-06-2${partyIndex}T12:00:00.000Z`,
    field: "signature",
    value: {
      signer_role_id: roleId,
      participant_display_name: party.signerName,
      signed_date_iso: `2026-06-2${partyIndex}`,
      signed_date_display: `June 2${partyIndex}, 2026`,
      document_id: "local_doc_test487",
    },
  };
}

describe("TEST487 — production validation (fresh four-party scenario)", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    sessionStorage.clear();
    clearCurrentSessionProEntitlementMarkers();
    getOrInitSessionAgreementGenerationId();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete({ source: "qa_bypass" });
  });

  afterEach(() => {
    storage.clear();
    clearCurrentSessionProEntitlementMarkers();
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPremiumPartyNamesHandoff();
    resetPremiumRecipientHandoffDedupForTests();
    resetCanonicalPartyMetadataDiagnosticsForTests();
    vi.unstubAllGlobals();
  });

  it("full production lifecycle: intake → SoT → review → signer setup → signing → completion", () => {
    const intake = TEST487_PRODUCTION_INTAKE;
    const draft = test487DraftWithFourParsedParties();
    const legalEntities = [...TEST487_FOUR_PARTY_LEGAL_ENTITIES];

    // ── Intake: parsing, structured model, no drift/truncation/placeholder repair ──
    const labeledBlocks = parseLabeledPartyBlocks(intake);
    expect(labeledBlocks).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) {
      expect(labeledBlocks[i]!.legalEntity).toContain(
        TEST487_FOUR_PARTY[i]!.legalEntity.split(" ")[0]!,
      );
      expect(labeledBlocks[i]!.signerName).toBe(TEST487_SIGNER_NAMES[i]);
      expect(labeledBlocks[i]!.address).toBe(TEST487_MAILING_ADDRESSES[i]);
      for (const marker of TEST487_ADDRESS_CONTAMINATION_MARKERS) {
        expect(labeledBlocks[i]!.address).not.toContain(marker);
      }
    }

    const structured = parseAllStructuredPartyContactBlocks(intake);
    expect(structured).toHaveLength(4);
    expect(structured[3]!.address).toBe(TEST487_MAILING_ADDRESSES[3]);

    const extracted = extractCanonicalIntakeSignerMetadata(intake);
    expect(extracted.filter((r) => r.signerName.trim()).length).toBe(4);
    expect(extracted.filter((r) => r.signerEmail.trim()).length).toBe(4);

    const aligned = alignIntakeSignerMetadataToLegalEntities(intake, legalEntities);
    expect(aligned.filter((s) => s.partyAddress.trim()).length).toBe(4);
    for (let i = 0; i < 4; i += 1) {
      expect(sanitizeCanonicalPartyAddress(aligned[i]!.partyAddress)).toBe(
        TEST487_MAILING_ADDRESSES[i],
      );
    }

    const intakeParties = authorityPartiesFromIntakeSignerMetadata(intake, legalEntities);
    assertPartyAlignment("intake_authority", intakeParties);
    assertNoForbiddenEntityAuthority("intake_authority", intakeParties);

    const slotCounts = countIntakeSignerMetadataSlots(intake, legalEntities);
    expect(slotCounts.slotsWithSignerName).toBe(4);
    expect(slotCounts.slotsWithEmail).toBe(4);
    expect(intake).toMatch(/Insurance Requirements/i);
    expect(intake).toMatch(/Acceptance Criteria/i);
    expect(intake).toMatch(/Payment Milestones/i);

    establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities,
      intakeText: intake,
      mutationSource: "structured_intake",
    });
    const fieldCounts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(fieldCounts.signerNameCount).toBe(4);
    expect(fieldCounts.titleCount).toBe(4);
    expect(fieldCounts.emailCount).toBe(4);
    expect(fieldCounts.addressCount).toBe(4);

    // ── SoT establishment ──
    const raw = buildTest487AcceptedCorpus(intake);
    const prep = preparePaidProServerDocumentForAcceptance(raw, draft, intake);
    markPaidProPipelineValidationPassed({ text: prep.text, source: "server_full_draft" });

    assertCanonicalPartyCount("test487", intake, draft, 4, prep.text);
    expect(
      consumeAuthoritativeSignerCount("test487_consume", {
        intakeText: intake,
        draftParties: draft.parties,
        corpusPlain: prep.text,
        manifestPartyCount: 4,
      }),
    ).toBe(4);

    establishPaidProSourceOfTruth({
      text: prep.text,
      source: "server_full_draft",
      draft,
      intakeText: intake,
      generationOutcome: "ok",
    });
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(2000);

    const contamination = evaluateProfessionalCorpusContamination(sot, {
      partyNames: legalEntities,
      partyCount: 4,
      intakeText: intake,
      signerNames: TEST487_SIGNER_NAMES,
    });
    expect(contamination.ok, contamination.issues.map((i) => i.code).join(",")).toBe(true);

    // ── Signer setup: metadata, addresses, emails, titles, party count ──
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test487_signer_setup",
      legalEntities,
      intakeText: intake,
      draft,
      uiSignerNames: TEST487_SIGNER_NAMES,
      uiSignerTitles: TEST487_FOUR_PARTY.map((p) => p.signerTitle),
      uiSignerEmails: TEST487_PARTY_EMAILS,
      uiPartyAddresses: TEST487_MAILING_ADDRESSES,
      authoritativePartyCount: 4,
    });
    expect(seed.names).toEqual(TEST487_SIGNER_NAMES);
    for (let i = 0; i < 4; i += 1) {
      expect(seed.addresses[i]).toBe(TEST487_MAILING_ADDRESSES[i]);
    }

    const finalizeAuthority = buildPaidProSignerMetadataAuthorityForFinalize(
      test487LiveUiWithBlankExtraLegalNames(),
      { intakeText: intake, draftPartyNames: [TEST487_LUMEN, TEST487_THALASSA] },
    );
    assertPartyAlignment("signer_setup_finalize", finalizeAuthority.parties);
    assertNoForbiddenEntityAuthority("signer_setup_finalize", finalizeAuthority.parties);
    assertAuthorityPartiesMetadata(
      "signer_setup_finalize",
      finalizeAuthority.parties,
      legalEntities,
      TEST487_SIGNER_NAMES,
    );

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 4,
      intakeText: intake,
      draftPartyNames: legalEntities,
      partySignerNames: TEST487_SIGNER_NAMES,
      recipient1Name: TEST487_LUMEN,
      recipient2Name: TEST487_THALASSA,
      recipient1Email: TEST487_PARTY_EMAILS[0]!,
      recipient2Email: TEST487_PARTY_EMAILS[1]!,
      extraPartyReviewEmails: TEST487_PARTY_EMAILS.slice(2),
      extraPartyLegalNames: [TEST487_COASTAL, TEST487_VANGUARD],
    });
    expect(gate.complete).toBe(true);

    const liveUiParties = buildLivePaidProSignerMetadataAuthority(
      test487LiveUiWithBlankExtraLegalNames(),
      "live_ui",
      { intakeText: intake, draftPartyNames: [TEST487_LUMEN, TEST487_THALASSA] },
    ).parties;
    expect(liveUiParties[2]?.partyLegalName).toContain("Coastal Meridian");
    expect(liveUiParties[3]?.partyLegalName).toContain("Vanguard Regulatory");

    writePremiumRecipientHandoffFromAuthorityParties(finalizeAuthority.parties);
    const handoff = readPremiumRecipientHandoff();
    expect(handoff).toBeTruthy();
    const handoffSlots = linearPremiumRecipientSlots(handoff, 4);
    assertHandoffSlotIntegrity(handoff, 4, legalEntities);
    expect(handoffSlots.filter((s) => s.signerName?.trim()).length).toBe(4);

    setConsumedPaidProSignerMetadataAuthority(finalizeAuthority);

    // ── Review: body, notices, execution blocks ──
    const reviewPlain = resolvePaidProReviewRenderPlain({ draft, intakeText: intake });
    expect(hasBareEntityOnlyNoticeStanzas(reviewPlain)).toBe(false);
    for (const name of TEST487_SIGNER_NAMES) {
      expect(reviewPlain).toContain(name);
    }
    for (const email of TEST487_PARTY_EMAILS) {
      expect(reviewPlain).toContain(email);
    }
    expect(reviewPlain).toMatch(/\$250,000|\$1,925,000|payment/i);
    expect(reviewPlain).toMatch(/confidential/i);
    expect(reviewPlain).toMatch(/intellectual property/i);
    expect(reviewPlain).toMatch(/limitation of liability/i);
    expect(reviewPlain).toMatch(/independent contractor/i);
    expect(reviewPlain).toMatch(/massachusetts/i);
    expect(reviewPlain).toMatch(/notices?/i);

    // ── Notice addresses: boundary repair (TEST486) + intake distinct notice preservation ──
    for (const party of TEST487_FOUR_PARTY) {
      expect(intake).toContain(party.noticeAddress);
    }
    const cleanNoticeCorpus = buildTest487OperativeNoticeCorpus(false);
    const cleanAddresses = extractPartyAddressesFromOperativeNoticeStanzas(cleanNoticeCorpus);
    expect(cleanAddresses).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) {
      expect(cleanAddresses[i]).toBe(TEST487_NOTICE_ADDRESSES[i]);
      for (const marker of TEST487_ADDRESS_CONTAMINATION_MARKERS) {
        expect(cleanAddresses[i]).not.toContain(marker);
      }
    }

    const pollutedNoticeCorpus = buildTest487OperativeNoticeCorpus(true);
    expect(noticeStanzaHasAddressPollution(pollutedNoticeCorpus.split(/\n(?=If to\s+)/i)[4] ?? "")).toBe(
      true,
    );
    const repaired = repairIncompleteIfToNoticeStanzas(
      pollutedNoticeCorpus,
      finalizeAuthority.parties,
    );
    expect(repaired.text).not.toMatch(/Address:\s[^\n]*Each party should/i);
    const repairedAddresses = extractPartyAddressesFromOperativeNoticeStanzas(repaired.text);
    expect(repairedAddresses[3]).not.toContain("Each party should");
    expect(repairedAddresses[3]).toContain("225 Market Street");
    expect(repairedAddresses[3]).toContain("Harrisburg, PA 17101");

    const noticeAuthority = applyPaidProNoticeContactAuthority(
      buildTest487OperativeNoticeCorpus(false),
      { draft, intakeText: intake },
    );
    const hydratedNotices = ensureOperativeIfToNoticeDelivery(
      noticeAuthority.text,
      finalizeAuthority.parties,
    );
    for (const party of TEST487_FOUR_PARTY) {
      expect(hydratedNotices.text).toContain(party.email);
      expect(hydratedNotices.text).toContain(party.signerName);
    }
    expect(hydratedNotices.text).not.toContain("provided during signer setup");
    expect(hydratedNotices.text).not.toMatch(/Address:\s[^\n]*Each party should/i);

    // ── Execution hydration ──
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: sot,
      authority: finalizeAuthority,
      intakeRaw: intake,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: true,
    });
    expect(hydrated.rejected).toBe(false);
    assertCorpusNPartyStructure({
      expectedN: 4,
      intakeText: intake,
      draft,
      parties: legalEntities,
      signerNames: TEST487_SIGNER_NAMES,
      corpus: hydrated.corpus,
      requireNoticeStanzas: true,
    });
    expect(countPartyBlocksInExecutionTail(hydrated.corpus, legalEntities)).toBe(4);
    expect(countPaidProExecutionBlocks(executionTail(hydrated.corpus))).toBe(1);

    const vs01Gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: hydrated.corpus,
      draft: { parties: draft.parties.map((p) => ({ name: p.name })) } as never,
      intakeText: intake,
      premiumAccepted: true,
      premiumComplete: true,
      guidedPro: true,
    });
    expect(vs01Gate.allowed).toBe(true);
    expect(vs01Gate.signerCount).toBe(4);

    // ── Signature preparation: packets, identity, routing ──
    const bridge = buildTest487BridgeSession(hydrated.corpus);
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
    expect(roles[0]?.signerName).toBe(TEST487_SIGNER_NAMES[0]);
    expect(roles[0]?.signerEmail).toBe(TEST487_PARTY_EMAILS[0]);
    for (let i = 1; i < 4; i += 1) {
      expect(roles[i]?.signerEmail).toBe(TEST487_PARTY_EMAILS[i]);
      expect(roles[i]?.signerName).toBe(TEST487_SIGNER_NAMES[i]);
      expect(roles[i]?.entityName).toContain(TEST487_FOUR_PARTY[i]!.legalEntity.split(" ")[0]!);
    }

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: hydrated.corpus,
      roles,
      initialsEnabled: true,
      bridge,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({
        agreementCorpusText: hydrated.corpus,
        bridge,
      }),
    });
    const manifest = buildFullPacketManifestFromCanonicalModel({ model, roles });
    expect(manifest.length).toBeGreaterThanOrEqual(4);

    // ── Signing: correct signer, witness dates, execution block ──
    const roleEntityNames = legalEntities;
    let signingCorpus = hydrated.corpus;
    for (let i = 0; i < 4; i += 1) {
      const sig = stampWitnessBlockPartySignature(
        signingCorpus,
        i,
        TEST487_SIGNER_NAMES[i]!,
        roleEntityNames,
      );
      expect(sig.stamped).toBe(true);
      signingCorpus = sig.text;
      const dated = stampWitnessBlockPartySigningDate(
        signingCorpus,
        i,
        `2026-06-2${i}`,
        roleEntityNames,
      );
      expect(dated.stamped).toBe(true);
      signingCorpus = dated.text;
    }
    const witnessCounts = countSignedWitnessBlocks(signingCorpus, roleEntityNames);
    expect(witnessCounts.signed).toBe(4);
    expect(witnessCounts.total).toBe(4);
    for (const name of TEST487_SIGNER_NAMES) {
      expect(signingCorpus).toContain(name);
    }

    const seedPortable = buildVs01CanonicalPacketSeed({
      documentId: bridge.vs01DocumentId,
      agreementId: bridge.agreementId,
      corpusPlain: signingCorpus,
    });
    expect(seedPortable).not.toBeNull();
    expect(fingerprintAgreementBody(signingCorpus)).toBe(seedPortable!.corpusHash);

    let portable = buildVs01CanonicalPacketPortable({
      seed: seedPortable!,
      roles,
      fields: manifest,
      pageCount: model.pages.length,
      witnessPageIndex: model.pages.findIndex((p) =>
        p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
      ),
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
            f.id === sigField.id ? { ...f, value: TEST487_SIGNER_NAMES[i]! } : f,
          ),
        };
      }
      auditLog.push(signatureCompletedEvent(i, role.roleId));
    }

    const draftWithAudit = {
      id: bridge.agreementId,
      audit_log: auditLog,
    } as unknown as AgreementDraft;

    const rebuilt = reconstructSignedCorpusFromAuditAndPortable({
      draft: draftWithAudit,
      portable,
    });
    expect(rebuilt).toBeTruthy();
    for (const entity of legalEntities) {
      expect(rebuilt!).toContain(entity.split(" ")[0]!);
    }
    for (const signer of TEST487_SIGNER_NAMES) {
      expect(rebuilt!).toContain(signer);
    }

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
        },
      },
    } as unknown as AgreementDraft);
    expect(resolved).not.toBeNull();
    expect(resolved!.text).toContain(TEST487_SIGNER_NAMES[0]!);
    expect(resolved!.text).toContain(TEST487_SIGNER_NAMES[3]!);

    const partiesFromUi = test487PartiesFromFinalizeUi();
    expect(partiesFromUi).toHaveLength(4);
    expect(partiesFromUi[2]?.partyLegalName).toContain("Coastal Meridian");
    expect(partiesFromUi[3]?.partyLegalName).toContain("Vanguard Regulatory");
  });
});
