/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fingerprintAgreementBody } from "../components/agreements/guidedDealCompletion/guidedSigningPacketVersion";
import { buildVs01PrepareSigningRolesForBridge } from "../components/agreements/paidProNPartySignerSetup";
import {
  persistHasTwoAuthorizedSigners,
} from "../components/agreements/paidProPaidReturnSignerFinalizedRestore";
import {
  clearFrozenSigningAuthoritySnapshotForSession,
  type FrozenSigningAuthoritySnapshotV1,
} from "../components/agreements/frozenSigningAuthoritySnapshot";
import { hashPaidProCorpus } from "../components/agreements/paidProSourceOfTruth";
import { buildVs01SigningPacketModel } from "./buildVs01SigningPacketModel";
import {
  clearAgreementVs01BridgeSession,
  clearPaidProAgreementBridgeSkipMarker,
  readAgreementVs01BridgeSession,
} from "../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  remountHasDualPartySignatureFields,
  remountPrepareShouldFailClosedWithoutCertifiedCorpus,
  remountSurfaceIsEmptySelfSignShell,
  resolveRemountPrepareCorpusIncludingContent,
  resolveRemountPrepareCorpusText,
  restorePrepareFromFrozenSigningAuthority,
} from "./vs01EsignRemountPrepareRestore";
import {
  FIRST_FAILING_DOUBLE_CONTINUE_REMOUNT_LOADING_PREDICATE,
  FIRST_FAILING_THIN_PERSIST_ACCEPTED_CRS_REMOUNT_PREDICATE,
  remountPrepareShouldPaintBeforeContentInspect,
  remountReviewPlainFromAcceptedOrPersist,
  resolveAcceptedCrsPlainForRemountPaint,
  resolveCertifiedReviewForEsignRemount,
} from "./vs01EsignRemountReviewBind";
import { signingPacketHasPaginatedCorpus } from "./vs01CanonicalPageRender";
import { reviewCorpusLooksLikeLeftoverFusedNotices } from "./vs01CurrentReviewSotForSeed";
import { VS01_SIGNING_CORPUS_MIN_LEN } from "./vs01SigningCorpus";

const AGREEMENT_ID = "4e18814c-c8fe-4eb9-85ae-a3e694cb596e";
const FIRST_CONTINUE_DOC = "doc_6a010f12701f42c58b8c66d936ba7879";
const DOUBLE_CONTINUE_DOC = "doc_64c3c8f219f2443085e40be8326ad814";

function cedarBlueServicesAgreement(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    "This Agreement is between Cedar Peak Design LLC (Client) and Blue Harbor Media Inc (Service Provider).",
    "",
    "1. SCOPE OF SERVICES. Provider will refresh the brand website.",
    "2. FEES. Client will pay 50% deposit on signing and 50% on delivery.",
    "3. TERM. Services run 4 weeks from signing.",
    "4. GOVERNING LAW. This Agreement is governed by the laws of the State of Texas.",
    "5. SUPPORT. Provider will provide reasonable implementation support during the term.",
    "",
    ...Array.from({ length: 28 }, () => "The parties agree to perform the stated commercial obligations in good faith."),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement electronically via LawDog.",
  ].join("\n");
}

function twoAuthorizedFrozen(): FrozenSigningAuthoritySnapshotV1 {
  const corpus = cedarBlueServicesAgreement();
  return {
    version: 1,
    agreementId: AGREEMENT_ID,
    agreementSessionId: "double_continue_remount",
    frozenCorpusHash: hashPaidProCorpus(corpus),
    frozenAt: new Date().toISOString(),
    parties: [
      {
        agreementPartyId: "party_cedar",
        legalEntityName: "Cedar Peak Design LLC",
        canonicalOrder: 0,
      },
      {
        agreementPartyId: "party_blue",
        legalEntityName: "Blue Harbor Media Inc",
        canonicalOrder: 1,
      },
    ],
    signers: [
      {
        signerRecordId: "signer:party_cedar:0",
        agreementPartyId: "party_cedar",
        signerName: "Alex Rivera",
        signerTitle: "Managing Member",
        signerEmail: "cryptocurated21+cedar.peak@gmail.com",
        signingOrder: 0,
        requiresSignature: true,
        requiresInitials: false,
      },
      {
        signerRecordId: "signer:party_blue:0",
        agreementPartyId: "party_blue",
        signerName: "Jordan Lee",
        signerTitle: "VP Operations",
        signerEmail: "cryptocurated21+blue.harbor@gmail.com",
        signingOrder: 1,
        requiresSignature: true,
        requiresInitials: false,
      },
    ],
    recipients: [],
    execution: {
      partyOrder: ["party_cedar", "party_blue"],
      signerOrder: ["signer:party_cedar:0", "signer:party_blue:0"],
      executionBlockHash: hashPaidProCorpus("witness"),
    },
  };
}

function leftoverLookingAcceptedCrs(): string {
  return [
    "SERVICES AGREEMENT",
    "",
    "This Agreement is between Cedar Peak Design LLC (Client) and Blue Harbor Media Inc (Service Provider).",
    "",
    "12. NOTICES",
    "If to Cedar Peak Design LLC:",
    "Address: 30 days notice at the registered office unless otherwise specified.",
    "If to Blue Harbor Media Inc:",
    "Attn: Jordan Lee",
    "",
    ...Array.from({ length: 28 }, () => "The parties agree to perform the stated commercial obligations in good faith."),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement electronically via LawDog.",
  ].join("\n");
}

function hungFetchContent(): Promise<never> {
  return new Promise(() => {
    /* leftover GET /content / seed POST never settles — live case 5 */
  });
}

describe("double-Continue minted Prepare remount content load", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearAgreementVs01BridgeSession();
    clearPaidProAgreementBridgeSkipMarker();
    clearFrozenSigningAuthoritySnapshotForSession();
  });

  it("names the first failing predicate: remount stuck on Loading without commercial Prepare", () => {
    expect(FIRST_FAILING_DOUBLE_CONTINUE_REMOUNT_LOADING_PREDICATE).toBe(
      "esign_double_continue_minted_prepare_stuck_loading",
    );
    expect(
      remountSurfaceIsEmptySelfSignShell({
        hideStepper: true,
        paidProAgreementBridgeSkip: false,
        step: 0,
        prepareRoleCount: 0,
        placedSignatureCount: 0,
      }),
    ).toBe(false);
    expect(remountPrepareShouldPaintBeforeContentInspect("")).toBe(false);
    expect(remountPrepareShouldPaintBeforeContentInspect(cedarBlueServicesAgreement())).toBe(true);
  });

  it("after vs01 seed / second Continue, remount paints Prepare from persist Review while GET /content hangs", async () => {
    const persistReview = cedarBlueServicesAgreement();
    expect(persistReview.length).toBeGreaterThanOrEqual(VS01_SIGNING_CORPUS_MIN_LEN);
    expect(FIRST_CONTINUE_DOC).not.toBe(DOUBLE_CONTINUE_DOC);

    const fetchContent = vi.fn(() => hungFetchContent());
    const certified = await Promise.race([
      resolveCertifiedReviewForEsignRemount({
        documentId: DOUBLE_CONTINUE_DOC,
        fetchDocumentMeta: async () => ({ agreementId: AGREEMENT_ID }),
        fetchDraft: async () => null,
        fetchAcceptedReviewCorpus: async () => "",
        fetchPersistReviewGet: async () => persistReview,
        fetchReviewPaintSot: async () => "",
      }),
      hungFetchContent().then(() => {
        throw new Error("must not wait on GET /content");
      }),
    ]);

    expect(fetchContent).not.toHaveBeenCalled();
    expect(certified.agreementId).toBe(AGREEMENT_ID);
    expect(certified.persistReviewCorpus).toBe(persistReview);
    expect(remountPrepareShouldPaintBeforeContentInspect(certified.persistReviewCorpus)).toBe(true);

    const frozen = twoAuthorizedFrozen();
    expect(persistHasTwoAuthorizedSigners(frozen)).toBe(true);
    const restored = await restorePrepareFromFrozenSigningAuthority({
      documentId: DOUBLE_CONTINUE_DOC,
      hideStepper: true,
      reviewCorpus: certified.persistReviewCorpus,
      agreementId: certified.agreementId,
      loadFrozen: async () => frozen,
      fetchDocumentMeta: async () => {
        throw new Error("must reuse certified agreementId");
      },
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(readAgreementVs01BridgeSession()?.vs01DocumentId).toBe(DOUBLE_CONTINUE_DOC);

    const remountCorpus = resolveRemountPrepareCorpusText({
      persistReviewCorpus: certified.persistReviewCorpus,
      restoredBridgeCorpus: restored.bridge.agreementCorpusText,
    });
    expect(remountCorpus.ok).toBe(true);
    if (!remountCorpus.ok) return;
    const contentSha256 = `corpus:${fingerprintAgreementBody(remountCorpus.corpus)}`;
    expect(contentSha256.startsWith("corpus:")).toBe(true);

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
    expect(signingPacketHasPaginatedCorpus(model)).toBe(true);
    const signatureFields = model.fields.filter((f) => f.type === "signature" && !f.autoInitials);
    expect(signatureFields.length).toBeGreaterThanOrEqual(2);
    expect(remountHasDualPartySignatureFields({ roles, fields: model.fields })).toBe(true);
    expect(
      remountSurfaceIsEmptySelfSignShell({
        hideStepper: true,
        paidProAgreementBridgeSkip: true,
        step: 2,
        prepareRoleCount: roles.length,
        placedSignatureCount: signatureFields.length,
      }),
    ).toBe(false);
    expect(
      remountPrepareShouldFailClosedWithoutCertifiedCorpus({
        hideStepper: true,
        seedDocumentId: DOUBLE_CONTINUE_DOC,
        remountPrepareRestored: true,
        corpus: remountCorpus,
      }),
    ).toBe(false);
  });

  it("does not regress #185 first-Continue remount when persist Review is present", async () => {
    const persistReview = cedarBlueServicesAgreement();
    const certified = await resolveCertifiedReviewForEsignRemount({
      documentId: FIRST_CONTINUE_DOC,
      fetchDocumentMeta: async () => ({ agreementId: AGREEMENT_ID }),
      fetchDraft: async () => null,
      fetchPersistReviewGet: async () => persistReview,
    });
    expect(certified.persistReviewCorpus.length).toBeGreaterThanOrEqual(VS01_SIGNING_CORPUS_MIN_LEN);
    const remountCorpus = resolveRemountPrepareCorpusText({
      persistReviewCorpus: certified.persistReviewCorpus,
      restoredBridgeCorpus: "",
    });
    expect(remountCorpus.ok).toBe(true);
    if (!remountCorpus.ok) return;
    expect(remountPrepareShouldPaintBeforeContentInspect(remountCorpus.corpus)).toBe(true);
  });

  it("empty persist Review still fails closed — does not invent commercial Prepare", () => {
    expect(remountPrepareShouldPaintBeforeContentInspect("")).toBe(false);
    const remountCorpus = resolveRemountPrepareCorpusText({
      persistReviewCorpus: "",
      restoredBridgeCorpus: "",
    });
    expect(remountCorpus.ok).toBe(false);
    expect(
      remountPrepareShouldFailClosedWithoutCertifiedCorpus({
        hideStepper: true,
        seedDocumentId: DOUBLE_CONTINUE_DOC,
        remountPrepareRestored: true,
        corpus: remountCorpus,
      }),
    ).toBe(true);
  });

  it("thin persist Review paints from accepted CRS + frozen SA without leftover inspect", async () => {
    expect(FIRST_FAILING_THIN_PERSIST_ACCEPTED_CRS_REMOUNT_PREDICATE).toBe(
      "esign_remount_fail_closes_thin_persist_despite_accepted_crs",
    );
    const acceptedCrs = leftoverLookingAcceptedCrs();
    expect(acceptedCrs.length).toBeGreaterThanOrEqual(VS01_SIGNING_CORPUS_MIN_LEN);
    expect(reviewCorpusLooksLikeLeftoverFusedNotices(acceptedCrs)).toBe(true);
    expect(
      remountReviewPlainFromAcceptedOrPersist(acceptedCrs, "too short pending persist"),
    ).toBe(acceptedCrs);

    const fetchContent = vi.fn(() => hungFetchContent());
    const certified = await Promise.race([
      resolveCertifiedReviewForEsignRemount({
        documentId: DOUBLE_CONTINUE_DOC,
        fetchDocumentMeta: async () => ({ agreementId: AGREEMENT_ID }),
        fetchDraft: async () =>
          ({
            id: AGREEMENT_ID,
            accepted_review_snapshot_v1: { status: "accepted", corpusPlain: acceptedCrs },
          }) as never,
        fetchAcceptedReviewCorpus: async () => "",
        fetchPersistReviewGet: async () => "pending persist under floor",
        fetchReviewPaintSot: async () => "",
      }),
      hungFetchContent().then(() => {
        throw new Error("must not wait on GET /content");
      }),
    ]);
    expect(fetchContent).not.toHaveBeenCalled();
    const paintCorpus = await resolveAcceptedCrsPlainForRemountPaint({
      agreementId: certified.agreementId,
      draft: certified.draft,
      persistReviewCorpus: certified.persistReviewCorpus,
      fetchAcceptedReviewCorpus: async () => "",
      fetchPersistReviewGet: async () => "pending persist under floor",
    });
    expect(paintCorpus).toBe(acceptedCrs);
    expect(remountPrepareShouldPaintBeforeContentInspect(paintCorpus)).toBe(true);

    const frozen = twoAuthorizedFrozen();
    const restored = await restorePrepareFromFrozenSigningAuthority({
      documentId: DOUBLE_CONTINUE_DOC,
      hideStepper: true,
      reviewCorpus: paintCorpus,
      agreementId: certified.agreementId,
      loadFrozen: async () => frozen,
      fetchDocumentMeta: async () => {
        throw new Error("must reuse certified agreementId");
      },
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;

    const remountCorpus = await resolveRemountPrepareCorpusIncludingContent({
      persistReviewCorpus: paintCorpus,
      restoredBridgeCorpus: restored.bridge.agreementCorpusText,
      fetchDocumentContentPlain: () => {
        throw new Error("must not fetch GET /content when accepted CRS is ready");
      },
    });
    expect(remountCorpus.ok).toBe(true);
    if (!remountCorpus.ok) return;
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
    expect(signingPacketHasPaginatedCorpus(model)).toBe(true);
    const signatureFields = model.fields.filter((f) => f.type === "signature" && !f.autoInitials);
    expect(signatureFields.length).toBeGreaterThanOrEqual(1);
    expect(
      remountPrepareShouldFailClosedWithoutCertifiedCorpus({
        hideStepper: true,
        seedDocumentId: DOUBLE_CONTINUE_DOC,
        remountPrepareRestored: true,
        corpus: remountCorpus,
      }),
    ).toBe(false);
  });

  it("thin persist + empty CRS paints from document content without seed POST", async () => {
    const contentPlain = cedarBlueServicesAgreement();
    const certified = await resolveCertifiedReviewForEsignRemount({
      documentId: DOUBLE_CONTINUE_DOC,
      fetchDocumentMeta: async () => ({ agreementId: AGREEMENT_ID }),
      fetchDraft: async () => null,
      fetchAcceptedReviewCorpus: async () => "",
      fetchPersistReviewGet: async () => "short pending",
      fetchReviewPaintSot: async () => "",
    });
    expect(certified.persistReviewCorpus).toBe("");
    expect(remountPrepareShouldPaintBeforeContentInspect(certified.persistReviewCorpus)).toBe(false);

    const fetchContentPlain = vi.fn(async () => contentPlain);
    const remountCorpus = await resolveRemountPrepareCorpusIncludingContent({
      persistReviewCorpus: certified.persistReviewCorpus,
      restoredBridgeCorpus: "",
      fetchDocumentContentPlain: fetchContentPlain,
    });
    expect(fetchContentPlain).toHaveBeenCalledTimes(1);
    expect(remountCorpus.ok).toBe(true);
    if (!remountCorpus.ok) return;
    expect(remountCorpus.corpus).toBe(contentPlain);
    expect(remountPrepareShouldPaintBeforeContentInspect(remountCorpus.corpus)).toBe(true);
  });

  it("wizard leaves Loading from persist Review before fetchDocumentContent", () => {
    const wizard = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    const start = wizard.indexOf("/** Deep link: /app/esign/:documentId");
    const persistAt = wizard.indexOf("resolveCertifiedReviewForEsignRemount", start);
    const shaAt = wizard.indexOf("setContentSha256(`corpus:${fingerprintAgreementBody(remountCorpus.corpus)}`)", start);
    const paintGateAt = wizard.indexOf(
      "const paintedFromPersistReview = remountPrepareShouldPaintBeforeContentInspect",
      start,
    );
    const fetchAt = wizard.indexOf("const blob = await fetchDocumentContent(sid)", start);
    expect(persistAt).toBeGreaterThan(start);
    expect(shaAt).toBeGreaterThan(persistAt);
    expect(paintGateAt).toBeGreaterThan(shaAt);
    expect(fetchAt).toBeGreaterThan(paintGateAt);
    expect(wizard).toContain("setVs01LinkedAgreementId(remountAgreementId)");
    expect(wizard).toContain("paintedFromPersistReview && hideStepper && sid.startsWith(\"doc_\")");
    expect(wizard).toContain("resolveRemountPrepareCorpusIncludingContent");
    expect(wizard).toContain("fetchRemountPaintPlainFromDocumentContent");
    expect(wizard).toContain("resolveAcceptedCrsPlainForRemountPaint");
    expect(wizard.slice(start, shaAt)).not.toContain("const blob = await fetchDocumentContent(sid)");
  });
});
