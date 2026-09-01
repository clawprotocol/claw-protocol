/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reviewPlainHasSkippedSectionNumbers } from "../components/agreements/reviewPlainSectionContinuity";
import {
  persistHasTwoAuthorizedSigners,
  frozenSigningAuthorityToAuthorityParties,
} from "../components/agreements/paidProPaidReturnSignerFinalizedRestore";
import {
  clearFrozenSigningAuthoritySnapshotForSession,
  type FrozenSigningAuthoritySnapshotV1,
} from "../components/agreements/frozenSigningAuthoritySnapshot";
import { hashPaidProCorpus } from "../components/agreements/paidProSourceOfTruth";
import { buildVs01PrepareSigningRolesForBridge } from "../components/agreements/paidProNPartySignerSetup";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import {
  clearAgreementVs01BridgeSession,
  clearPaidProAgreementBridgeSkipMarker,
  computePaidProAgreementBridgeSkip,
  readAgreementVs01BridgeSession,
  readPaidProAgreementBridgeSkipMarker,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  FIRST_FAILING_REMOUNT_PREPARE_CORPUS_UNSET_PREDICATE,
  FIRST_FAILING_REMOUNT_SELF_SIGN_SHELL_PREDICATE,
  PREPARE_RESTORED_FROM_FROZEN_SIGNING_AUTHORITY,
  matchingPrepareBridgeForDocument,
  overlayFrozenSigningAuthorityOntoDraft,
  recipientSetupFromFrozenSigningAuthority,
  remountHasDualPartySignatureFields,
  remountPrepareHydrateWouldSkipUnsetCorpus,
  remountPrepareShouldFailClosedWithoutCertifiedCorpus,
  remountSurfaceIsEmptySelfSignShell,
  resolveRemountPrepareCorpusText,
  restorePrepareFromFrozenSigningAuthority,
  shouldRestorePrepareFromFrozenSigningAuthority,
} from "./vs01EsignRemountPrepareRestore";
import { resolveFinalVs01CorpusOrBlock } from "./vs01SigningCorpus";
import { leftoverRemountShouldFailClosedToast } from "./vs01EsignRemountReviewBind";
import { reviewCorpusLooksLikeLeftoverFusedNotices } from "./vs01CurrentReviewSotForSeed";

const AGREEMENT_ID = "ag_prepare_dual_party_remount";
const SEEDED_DOC = "doc_prepare_dual_party_seed";

function servicesAgreementCorpus(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    "This Agreement is between Northline Studio (Client) and Harbor Marks LLC (Service Provider).",
    "",
    ...Array.from({ length: 36 }, (_, i) => `${i + 1}. Operative commercial clause with consideration and duties.`),
    "",
    "If to Northline Studio:",
    "Attn: Priya Shah",
    "Email: priya@example.test",
    "",
    "If to Harbor Marks LLC:",
    "Attn: Diego Alvarez",
    "Email: diego@example.test",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    "Northline Studio",
    "By: ______________________",
    "Name: Priya Shah",
    "Title: Authorized Signer",
    "Date: ____________________",
    "",
    "SERVICE PROVIDER:",
    "Harbor Marks LLC",
    "By: ______________________",
    "Name: Diego Alvarez",
    "Title: Authorized Signer",
    "Date: ____________________",
  ].join("\n");
}

function leftoverFusedNoticesCorpus(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    "This Agreement is between Alpha Workshop (Client) and Beta Counsel LLC (Service Provider).",
    "",
    "12. NOTICES",
    "If to Alpha Workshop Beta Counsel LLC:",
    "If to Beta Counsel LLC:",
    "Address: 30 days, Upon full execution by the parties unless otherwise specified.",
    "13. MISCELLANEOUS",
    "This Agreement is the entire agreement This Agreement is between Alpha Workshop Beta Counsel LLC ('Service Provider') and Service Provider ('Service Provider').",
    "",
    ...Array.from({ length: 40 }, () => "Operative commercial clause with consideration and duties."),
  ].join("\n");
}

function twoAuthorizedFrozen(): FrozenSigningAuthoritySnapshotV1 {
  return {
    version: 1,
    agreementId: AGREEMENT_ID,
    agreementSessionId: "inspect_tab_session",
    frozenCorpusHash: hashPaidProCorpus(servicesAgreementCorpus()),
    frozenAt: new Date().toISOString(),
    parties: [
      {
        agreementPartyId: "party_northline",
        legalEntityName: "Northline Studio",
        canonicalOrder: 0,
      },
      {
        agreementPartyId: "party_harbor",
        legalEntityName: "Harbor Marks LLC",
        canonicalOrder: 1,
      },
    ],
    signers: [
      {
        signerRecordId: "signer:party_northline:0",
        agreementPartyId: "party_northline",
        signerName: "Priya Shah",
        signerTitle: "Authorized Signer",
        signerEmail: "priya@example.test",
        signingOrder: 0,
        requiresSignature: true,
        requiresInitials: false,
      },
      {
        signerRecordId: "signer:party_harbor:0",
        agreementPartyId: "party_harbor",
        signerName: "Diego Alvarez",
        signerTitle: "Authorized Signer",
        signerEmail: "diego@example.test",
        signingOrder: 1,
        requiresSignature: true,
        requiresInitials: false,
      },
    ],
    recipients: [],
    execution: {
      partyOrder: ["party_northline", "party_harbor"],
      signerOrder: ["signer:party_northline:0", "signer:party_harbor:0"],
      executionBlockHash: hashPaidProCorpus("witness"),
    },
  };
}

describe("esign remount Prepare dual-party fields (not empty self-sign)", () => {
  afterEach(() => {
    sessionStorage.clear();
    clearAgreementVs01BridgeSession();
    clearPaidProAgreementBridgeSkipMarker();
    clearFrozenSigningAuthoritySnapshotForSession();
  });

  it("first failing predicate: remount Step 3 self-sign with zero fields is the hole", () => {
    expect(FIRST_FAILING_REMOUNT_SELF_SIGN_SHELL_PREDICATE).toBe(
      "esign_remount_lands_empty_self_sign_step3_not_prepare",
    );
    expect(
      remountSurfaceIsEmptySelfSignShell({
        hideStepper: true,
        paidProAgreementBridgeSkip: false,
        step: 2,
        prepareRoleCount: 0,
        placedSignatureCount: 0,
      }),
    ).toBe(true);
    expect(
      remountSurfaceIsEmptySelfSignShell({
        hideStepper: true,
        paidProAgreementBridgeSkip: true,
        step: 2,
        prepareRoleCount: 2,
        placedSignatureCount: 2,
      }),
    ).toBe(false);
  });

  it("inspect remount without session restores Prepare from frozen-signing-authority", async () => {
    expect(
      shouldRestorePrepareFromFrozenSigningAuthority({
        hideStepper: true,
        seedDocumentId: SEEDED_DOC,
        paidProAgreementBridgeSkip: false,
        matchingBridge: false,
        frozenAuthorizedSignerCount: 2,
      }),
    ).toBe(true);
    expect(computePaidProAgreementBridgeSkip(SEEDED_DOC, true)).toBe(false);
    expect(matchingPrepareBridgeForDocument(SEEDED_DOC)).toBeNull();

    const frozen = twoAuthorizedFrozen();
    expect(persistHasTwoAuthorizedSigners(frozen)).toBe(true);

    const restored = await restorePrepareFromFrozenSigningAuthority({
      documentId: SEEDED_DOC,
      hideStepper: true,
      reviewCorpus: servicesAgreementCorpus(),
      agreementId: AGREEMENT_ID,
      draft: overlayFrozenSigningAuthorityOntoDraft(null, frozen, AGREEMENT_ID),
      loadFrozen: async () => frozen,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.reason).toBe(PREPARE_RESTORED_FROM_FROZEN_SIGNING_AUTHORITY);
    expect(restored.authorizedSignerCount).toBeGreaterThanOrEqual(2);
    expect(readPaidProAgreementBridgeSkipMarker(SEEDED_DOC)).toBe(true);
    expect(computePaidProAgreementBridgeSkip(SEEDED_DOC, true)).toBe(true);
    expect(readAgreementVs01BridgeSession()?.vs01DocumentId).toBe(SEEDED_DOC);

    const setup = recipientSetupFromFrozenSigningAuthority(frozen);
    expect(setup.recipientPartySignerNames).toEqual(["Priya Shah", "Diego Alvarez"]);
    const parties = frozenSigningAuthorityToAuthorityParties(frozen);
    expect(parties.map((p) => p.signerName)).toEqual(["Priya Shah", "Diego Alvarez"]);

    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: AGREEMENT_ID,
      creatorName: restored.bridge.creatorName,
      creatorEmail: restored.bridge.creatorEmail,
      ownerSignerName: restored.bridge.creatorSignerName,
      ownerSignerTitle: restored.bridge.creatorSignerTitle,
      counterparties: restored.bridge.counterparties,
      bridge: restored.bridge,
    });
    expect(roles.map((r) => (r.signerName ?? "").trim())).toEqual(["Priya Shah", "Diego Alvarez"]);

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: servicesAgreementCorpus(),
      roles,
      bridge: restored.bridge,
    });
    expect(model.allowed).toBe(true);
    expect(
      remountHasDualPartySignatureFields({
        roles,
        fields: model.fields,
      }),
    ).toBe(true);
    expect(
      remountSurfaceIsEmptySelfSignShell({
        hideStepper: true,
        paidProAgreementBridgeSkip: true,
        step: 2,
        prepareRoleCount: roles.length,
        placedSignatureCount: model.fields.filter((f) => f.type === "signature" && !f.autoInitials).length,
      }),
    ).toBe(false);
  });

  it("same doc_* remount keeps dual-party Prepare without hard-coded persist or leftover id", async () => {
    const frozen = twoAuthorizedFrozen();
    const first = await restorePrepareFromFrozenSigningAuthority({
      documentId: SEEDED_DOC,
      hideStepper: true,
      reviewCorpus: servicesAgreementCorpus(),
      agreementId: AGREEMENT_ID,
      draft: overlayFrozenSigningAuthorityOntoDraft(null, frozen, AGREEMENT_ID),
      loadFrozen: async () => frozen,
    });
    expect(first.ok).toBe(true);
    const second = await restorePrepareFromFrozenSigningAuthority({
      documentId: SEEDED_DOC,
      hideStepper: true,
      reviewCorpus: servicesAgreementCorpus(),
      agreementId: AGREEMENT_ID,
      loadFrozen: async () => frozen,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.documentId).toBe(SEEDED_DOC);
    expect(second.bridge.vs01DocumentId).toBe(SEEDED_DOC);
    expect(second.bridge.agreementId).toBe(AGREEMENT_ID);
    expect(second.bridge.creatorSignerName).toBe("Priya Shah");
    expect(second.bridge.counterparties.some((c) => c.signerName === "Diego Alvarez")).toBe(true);
  });

  it("does not invent Prepare for a one-signer frozen packet", async () => {
    const frozen = twoAuthorizedFrozen();
    frozen.signers = [frozen.signers[0]!];
    const restored = await restorePrepareFromFrozenSigningAuthority({
      documentId: SEEDED_DOC,
      hideStepper: true,
      reviewCorpus: servicesAgreementCorpus(),
      agreementId: AGREEMENT_ID,
      loadFrozen: async () => frozen,
    });
    expect(restored.ok).toBe(false);
    expect(computePaidProAgreementBridgeSkip(SEEDED_DOC, true)).toBe(false);
  });

  it("does not weaken 12-then-14 / 10-then-12 refuse", () => {
    const skipped1214 = [
      "1. Services and Deliverables",
      "2. Client Materials",
      "3. Fees and Payment",
      "4. Term and Termination",
      "5. Intellectual Property",
      "6. Confidentiality",
      "7. Representations and Warranties",
      "8. Limitation of Liability",
      "9. Indemnification",
      "10. Miscellaneous",
      "11. Independent Contractor",
      "12. Force Majeure",
      "14. Notices",
    ].join("\n\n");
    const skipped1012 = [
      "1. Services and Deliverables",
      "2. Fees and Payment",
      "3. Term and Termination",
      "4. Intellectual Property",
      "5. Confidentiality",
      "6. Limitation of Liability",
      "7. Indemnification",
      "8. Independent Contractor",
      "9. Force Majeure",
      "10. Miscellaneous",
      "12. Notices",
    ].join("\n\n");
    expect(reviewPlainHasSkippedSectionNumbers(skipped1214)).toBe(true);
    expect(reviewPlainHasSkippedSectionNumbers(skipped1012)).toBe(true);
  });

  it("wizard remount hydrates Prepare after leftover bind without reopening leftover pickers", () => {
    const wizard = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(wizard).toContain("restorePrepareFromFrozenSigningAuthority");
    expect(wizard).toContain("setPaidProAgreementBridgeSkip");
    expect(wizard).toContain("ensureReviewCorpusOnEsignEntry");
    expect(wizard).toContain("resolveRemountPrepareCorpusText");
    const start = wizard.indexOf("/** Deep link: /app/esign/:documentId");
    const leftoverAt = wizard.indexOf("ensureReviewCorpusOnEsignEntry", start);
    const restoreAt = wizard.indexOf("restorePrepareFromFrozenSigningAuthority", leftoverAt);
    const remountCorpusAt = wizard.indexOf("resolveRemountPrepareCorpusText", restoreAt);
    const hydrateAt = wizard.indexOf("const hydrateLocalPaidProBridge", restoreAt);
    expect(leftoverAt).toBeGreaterThan(start);
    expect(restoreAt).toBeGreaterThan(leftoverAt);
    expect(remountCorpusAt).toBeGreaterThan(restoreAt);
    expect(hydrateAt).toBeGreaterThan(remountCorpusAt);
    expect(wizard.slice(restoreAt, hydrateAt)).toContain("setPrepareCorpusText");
    expect(wizard.slice(restoreAt, hydrateAt)).not.toMatch(
      /bindAuthenticatedUserToWorkspace|workspaceBindingApi/,
    );
    expect(wizard).not.toContain("doc_e959491fdcef431c96052cbb74e0fdaf");
    expect(wizard).not.toContain("8a1057ee-df0a-4c0a-9c15-2817401ff962");
    expect(wizard).not.toContain("doc_91038fe3");
    expect(wizard).toMatch(
      /leftoverPacketNotPersistReview[\s\S]*hydrateLocalPaidProBridge\(\)/,
    );
  });

  it("remount Prepare with frozen restore + persist Review sets prepareCorpusText and packet model", async () => {
    expect(FIRST_FAILING_REMOUNT_PREPARE_CORPUS_UNSET_PREDICATE).toBe(
      "esign_remount_prepare_chrome_without_prepare_corpus_text",
    );
    const persistReview = servicesAgreementCorpus();
    expect(persistReview.length).toBeGreaterThanOrEqual(1500);
    expect(persistReview).toMatch(/SERVICES AGREEMENT/);

    // Live hole: restore paints chrome while hydrate skips unset/short corpus.
    expect(
      remountPrepareHydrateWouldSkipUnsetCorpus({
        persistReviewCorpus: "",
        bridgeAgreementCorpusText: "",
      }),
    ).toBe(true);
    expect(
      remountPrepareHydrateWouldSkipUnsetCorpus({
        persistReviewCorpus: persistReview,
        bridgeAgreementCorpusText: "",
      }),
    ).toBe(false);

    const frozen = twoAuthorizedFrozen();
    const restored = await restorePrepareFromFrozenSigningAuthority({
      documentId: SEEDED_DOC,
      hideStepper: true,
      reviewCorpus: persistReview,
      agreementId: AGREEMENT_ID,
      draft: overlayFrozenSigningAuthorityOntoDraft(null, frozen, AGREEMENT_ID),
      loadFrozen: async () => frozen,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    const remountCorpus = resolveRemountPrepareCorpusText({
      persistReviewCorpus: persistReview,
      restoredBridgeCorpus: restored.bridge.agreementCorpusText,
    });
    expect(remountCorpus.ok).toBe(true);
    if (!remountCorpus.ok) return;
    const prepareCorpusText = remountCorpus.corpus;
    expect(prepareCorpusText).toBe(persistReview);
    expect(prepareCorpusText).toMatch(/SERVICES AGREEMENT/);
    expect(reviewCorpusLooksLikeLeftoverFusedNotices(prepareCorpusText)).toBe(false);

    const gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: prepareCorpusText,
      guidedPro: true,
      prepareSignatureLinksRequested: true,
      signaturePreparationRequested: true,
      premiumComplete: true,
    });
    expect(gate.allowed).toBe(true);

    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: AGREEMENT_ID,
      creatorName: restored.bridge.creatorName,
      creatorEmail: restored.bridge.creatorEmail,
      ownerSignerName: restored.bridge.creatorSignerName,
      ownerSignerTitle: restored.bridge.creatorSignerTitle,
      counterparties: restored.bridge.counterparties,
      bridge: restored.bridge,
    });
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: prepareCorpusText,
      roles,
      bridge: restored.bridge,
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeGreaterThan(0);
    const signatureFields = model.fields.filter((f) => f.type === "signature" && !f.autoInitials);
    expect(signatureFields.length).toBeGreaterThanOrEqual(2);
    expect(
      remountHasDualPartySignatureFields({
        roles,
        fields: model.fields,
      }),
    ).toBe(true);
    expect(
      remountPrepareShouldFailClosedWithoutCertifiedCorpus({
        hideStepper: true,
        seedDocumentId: SEEDED_DOC,
        remountPrepareRestored: true,
        corpus: remountCorpus,
      }),
    ).toBe(false);
  });

  it("remount Prepare prefers persist Review when hydrate would skip short restored bridge", async () => {
    const persistReview = servicesAgreementCorpus();
    const frozen = twoAuthorizedFrozen();
    const restored = await restorePrepareFromFrozenSigningAuthority({
      documentId: SEEDED_DOC,
      hideStepper: true,
      reviewCorpus: "",
      agreementId: AGREEMENT_ID,
      draft: overlayFrozenSigningAuthorityOntoDraft(null, frozen, AGREEMENT_ID),
      loadFrozen: async () => frozen,
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect((restored.bridge.agreementCorpusText ?? "").trim().length).toBeLessThan(1500);
    expect(
      remountPrepareHydrateWouldSkipUnsetCorpus({
        persistReviewCorpus: "",
        bridgeAgreementCorpusText: restored.bridge.agreementCorpusText,
      }),
    ).toBe(true);

    const remountCorpus = resolveRemountPrepareCorpusText({
      persistReviewCorpus: persistReview,
      restoredBridgeCorpus: restored.bridge.agreementCorpusText,
    });
    expect(remountCorpus.ok).toBe(true);
    if (!remountCorpus.ok) return;
    expect(remountCorpus.corpus).toBe(persistReview);

    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: AGREEMENT_ID,
      creatorName: restored.bridge.creatorName,
      creatorEmail: restored.bridge.creatorEmail,
      ownerSignerName: restored.bridge.creatorSignerName,
      ownerSignerTitle: restored.bridge.creatorSignerTitle,
      counterparties: restored.bridge.counterparties,
      bridge: restored.bridge,
    });
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: remountCorpus.corpus,
      roles,
      bridge: restored.bridge,
    });
    expect(model.allowed).toBe(true);
    expect(model.fields.filter((f) => f.type === "signature" && !f.autoInitials).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  it("short or empty remount corpus fail-closes after frozen restore", () => {
    const empty = resolveRemountPrepareCorpusText({
      persistReviewCorpus: "",
      restoredBridgeCorpus: "",
    });
    expect(empty.ok).toBe(false);
    if (empty.ok) return;
    expect(empty.reason).toBe("empty_or_short");
    expect(leftoverRemountShouldFailClosedToast("")).toBe(true);
    expect(
      remountPrepareShouldFailClosedWithoutCertifiedCorpus({
        hideStepper: true,
        seedDocumentId: SEEDED_DOC,
        remountPrepareRestored: true,
        corpus: empty,
      }),
    ).toBe(true);

    const short = resolveRemountPrepareCorpusText({
      persistReviewCorpus: "SERVICES AGREEMENT\n\nToo short to paginate.",
      restoredBridgeCorpus: "x".repeat(200),
    });
    expect(short.ok).toBe(false);
    if (short.ok) return;
    expect(short.reason).toBe("empty_or_short");
    expect(
      remountPrepareShouldFailClosedWithoutCertifiedCorpus({
        hideStepper: true,
        seedDocumentId: SEEDED_DOC,
        remountPrepareRestored: true,
        corpus: short,
      }),
    ).toBe(true);
  });

  it("leftover fused Notices is refused as remount Prepare corpus", () => {
    const leftover = leftoverFusedNoticesCorpus();
    expect(leftover.length).toBeGreaterThanOrEqual(1500);
    expect(reviewCorpusLooksLikeLeftoverFusedNotices(leftover)).toBe(true);
    const refused = resolveRemountPrepareCorpusText({
      persistReviewCorpus: leftover,
      restoredBridgeCorpus: leftover,
    });
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.reason).toBe("leftover_fused");
    expect(
      remountPrepareShouldFailClosedWithoutCertifiedCorpus({
        hideStepper: true,
        seedDocumentId: SEEDED_DOC,
        remountPrepareRestored: true,
        corpus: refused,
      }),
    ).toBe(true);
    expect(
      remountPrepareShouldFailClosedWithoutCertifiedCorpus({
        hideStepper: true,
        seedDocumentId: SEEDED_DOC,
        remountPrepareRestored: false,
        corpus: refused,
      }),
    ).toBe(true);
  });

  it("remount Prepare corpus hydrate is sync and is not gated on workspace bind", () => {
    const src = readFileSync(join(__dirname, "vs01EsignRemountPrepareRestore.ts"), "utf8");
    expect(src).not.toMatch(/bindAuthenticatedUserToWorkspace|workspaceBindingApi/);
    expect(src).toMatch(/export function resolveRemountPrepareCorpusText\(/);
    expect(src).not.toMatch(/export async function resolveRemountPrepareCorpusText/);
    const persistReview = servicesAgreementCorpus();
    const started = Date.now();
    const remountCorpus = resolveRemountPrepareCorpusText({
      persistReviewCorpus: persistReview,
      restoredBridgeCorpus: "",
    });
    expect(Date.now() - started).toBeLessThan(50);
    expect(remountCorpus.ok).toBe(true);
  });
});
