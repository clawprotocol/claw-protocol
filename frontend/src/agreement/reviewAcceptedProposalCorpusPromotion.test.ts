/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import { formatAgreementPlainTextForEditing } from "./formatAgreementPlainTextForEditing";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "../components/agreements/authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
} from "../components/agreements/authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "../components/agreements/guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "../components/agreements/paidProSignerMetadataAuthority";
import { resolvePaidProPostFinalizeReviewPlain } from "../components/agreements/paidProPostFinalizeReviewSurface";
import { resolvePaidProReviewLinkCorpusPlain } from "../components/agreements/paidProReviewLinkCorpusParity";
import { clearPaidProPinnedSignerAppliedCorpus, setPaidProPinnedSignerAppliedCorpus } from "../components/agreements/paidProFinalHydratedCorpus";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth, hashPaidProCorpus } from "../components/agreements/paidProSourceOfTruth";
import { canFinalizeReviewForSigning, computeOwnerDoneReviewApprovalPresentation } from "../components/agreements/draftRecipientReviewSignals";
import { buildReviewFirstDocumentDisplayHtml } from "./reviewFirstDocumentDisplay";
import { resolveReviewFirstDisplayCorpus } from "../launch/simpleProduct/reviewFirstDisplayCorpus";
import {
  clearReviewFirstHandoffSource,
  peekReviewFirstPinnedCorpus,
} from "../launch/simpleProduct/reviewFirstSendSurface";
import { normalizeSigningPacketCorpusLines, buildVs01SigningPacketModel } from "../vs01/buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "../vs01/vs01SignerFieldAssignment";
import { resolveFinalVs01CorpusOrBlock } from "../vs01/vs01SigningCorpus";
import {
  acceptedProposalCorpusText,
  commitAcceptedReviewCorpusPromotion,
  resolveAcceptedReviewCorpusFromDraft,
} from "./reviewCorpusAuthority";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const AGREEMENT_ID = "ag_test321_accepted_promotion";
const OLD_CITY = "Boose";
const NEW_CITY = "Boise";
const PARTY1_ADDRESS_OLD = `1027 S. Rainbow Blvd., #124, ${OLD_CITY}, ID 34213`;
const PARTY1_ADDRESS_NEW = `1027 S. Rainbow Blvd., #124, ${NEW_CITY}, ID 34213`;

function buildCorpus(_party1Address: string) {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    ...Array.from({ length: 28 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${BLUE}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n");
}

function qaAuthority(party1Address: string) {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "bca342@me.com",
    recipient2Email: "ivs345@gmail.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [party1Address, "8945 Hayride Rd., Metairie, LA 70003"],
  });
}

function armFinalizeSnapshot(hydratedCorpus: string, party1Address: string) {
  const authority = qaAuthority(party1Address);
  setConsumedPaidProSignerMetadataAuthority(authority);
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: hydratedCorpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  setPaidProPinnedSignerAppliedCorpus(hydratedCorpus);
}

function appliedDraft(correctedCorpus: string): AgreementDraft {
  return {
    id: AGREEMENT_ID,
    title: "Consulting Agreement",
    jurisdiction: "ID",
    parties: [
      { id: "p-blue", name: BLUE, role: "party" },
      { id: "p-iron", name: IRON, role: "reviewer" },
    ],
    purpose: correctedCorpus,
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-06-08T00:00:00.000Z",
    updated_at: "2026-06-08T01:00:00.000Z",
    versions: [],
    server_full_document_text: buildCorpus(PARTY1_ADDRESS_OLD),
    premium_render_source: "review_first_final_corpus",
    pro_redline_v1: {
      review_first_final_corpus: {
        text: correctedCorpus,
        source: "recipient_proposal_applied",
        hash: hashPaidProCorpus(correctedCorpus),
      },
    },
    audit_log: [
      {
        event_type: "recipient_proposal_pending",
        at: "2026-06-08T00:30:00.000Z",
        value: {
          proposal_id: "prop-address",
          proposer_id: "p-blue",
          instruction: "Fix city spelling",
          draft: { purpose: correctedCorpus },
        },
      },
      {
        event_type: "recipient_proposal_applied",
        at: "2026-06-08T01:00:00.000Z",
        value: { proposal_id: "prop-address" },
      },
    ],
  } as AgreementDraft;
}

function reviewerRows() {
  return [
    {
      displayName: BLUE,
      reviewHref: `/agreements/${AGREEMENT_ID}/review?party=1`,
      recipientPartyId: "p-blue",
    },
    {
      displayName: IRON,
      reviewHref: `/agreements/${AGREEMENT_ID}/review?party=2`,
      recipientPartyId: "p-iron",
    },
  ];
}

/** Fresh tab: no session pin, snapshot, or consumed signer authority — server draft only. */
function simulateFreshBrowserSession() {
  sessionStorage.clear();
  clearAuthoritativeSigningSnapshot();
  clearPaidProPinnedSignerAppliedCorpus();
  clearReviewFirstHandoffSource();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProSourceOfTruth();
  expect(peekReviewFirstPinnedCorpus(AGREEMENT_ID)).toBeNull();
  expect(getAuthoritativeSigningSnapshot()).toBeNull();
}

function assertBoiseNotBoose(text: string, label: string) {
  expect(text, label).toContain(NEW_CITY);
  expect(text, label).not.toContain(OLD_CITY);
}

describe("accepted review proposal corpus promotion (TEST321)", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    clearReviewFirstHandoffSource();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("promotes Boose → Boise into snapshot, display, copy, and signing handoff", () => {
    const originalBody = buildCorpus(PARTY1_ADDRESS_OLD);
    establishPaidProSourceOfTruth({
      text: originalBody,
      source: "server_full_draft",
      intakeText: "consulting agreement",
    });
    const authority = qaAuthority(PARTY1_ADDRESS_OLD);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: originalBody,
      authority,
      intakeRaw: "",
      surface: "test321_finalize",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    armFinalizeSnapshot(hydrated.corpus, PARTY1_ADDRESS_OLD);

    const beforeHash = getAuthoritativeSigningSnapshot()?.hash ?? "";
    expect(hydrated.corpus).toContain(OLD_CITY);

    const corrected = buildCorpus(PARTY1_ADDRESS_NEW);
    const promotion = commitAcceptedReviewCorpusPromotion({
      agreementId: AGREEMENT_ID,
      corpusText: corrected,
      draft: appliedDraft(corrected),
      oldTextMarker: OLD_CITY,
      acceptedTextMarker: NEW_CITY,
    });

    expect(promotion.beforeAcceptHash).toBe(beforeHash);
    expect(promotion.afterAcceptHash).not.toBe(beforeHash);
    expect(promotion.selectedDisplaySource).not.toBe("authoritative_signing_snapshot");

    const draft = appliedDraft(corrected);
    const ownerDone = resolveReviewFirstDisplayCorpus(draft, "owner_done");
    expect(ownerDone?.text).toContain(NEW_CITY);
    expect(ownerDone?.text).not.toContain(OLD_CITY);

    const party1 = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    expect(party1?.text).toContain(NEW_CITY);
    expect(party1?.text).not.toContain(OLD_CITY);

    const copyExport = resolveReviewFirstDisplayCorpus(draft, "copy_export");
    expect(formatAgreementPlainTextForEditing(copyExport?.text ?? "")).toContain(NEW_CITY);

    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: party1?.text,
      draft,
      surface: "reviewer",
      selectedCorpusSource: party1?.source,
    });
    expect(html).toContain(NEW_CITY);
    expect(html).not.toContain(OLD_CITY);

    const snapshotAfter = resolvePaidProPostFinalizeReviewPlain();
    expect(snapshotAfter).toContain(NEW_CITY);
    expect(snapshotAfter).not.toContain(OLD_CITY);

    const vs01Lines = normalizeSigningPacketCorpusLines(snapshotAfter);
    expect(vs01Lines.join("\n")).toContain(NEW_CITY);
    expect(vs01Lines.join("\n")).not.toContain(OLD_CITY);
    expect(vs01Lines.join("\n")).not.toMatch(/Email for Notice:.*Address for Notice:/);

    const pinned = peekReviewFirstPinnedCorpus(AGREEMENT_ID);
    expect(pinned).toContain(NEW_CITY);

    const linkCorpus = resolvePaidProReviewLinkCorpusPlain();
    expect(linkCorpus?.plain).toContain(NEW_CITY);
  });

  it("hard refresh after accept: server draft only — owner done, reviewers, copy, download, VS01", () => {
    const originalBody = buildCorpus(PARTY1_ADDRESS_OLD);
    establishPaidProSourceOfTruth({
      text: originalBody,
      source: "server_full_draft",
      intakeText: "consulting agreement",
    });
    const authority = qaAuthority(PARTY1_ADDRESS_OLD);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: originalBody,
      authority,
      intakeRaw: "",
      surface: "test321_hard_refresh",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    armFinalizeSnapshot(hydrated.corpus, PARTY1_ADDRESS_OLD);

    const corrected = buildCorpus(PARTY1_ADDRESS_NEW);
    commitAcceptedReviewCorpusPromotion({
      agreementId: AGREEMENT_ID,
      corpusText: corrected,
      draft: appliedDraft(corrected),
      oldTextMarker: OLD_CITY,
      acceptedTextMarker: NEW_CITY,
    });

    simulateFreshBrowserSession();

    const serverDraft = appliedDraft(corrected);
    expect(serverDraft.server_full_document_text).toContain(OLD_CITY);

    const ownerDone = resolveReviewFirstDisplayCorpus(serverDraft, "owner_done");
    expect(ownerDone?.source).toBe("review_first_final_corpus");
    expect(ownerDone?.source).not.toBe("authoritative_signing_snapshot");
    expect(ownerDone?.source).not.toBe("review_first_pinned_corpus");
    assertBoiseNotBoose(ownerDone?.text ?? "", "owner done visible document");

    const party1Reviewer = resolveReviewFirstDisplayCorpus(serverDraft, "reviewer");
    assertBoiseNotBoose(party1Reviewer?.text ?? "", "party 1 reviewer document");
    const party1Html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: party1Reviewer?.text,
      draft: serverDraft,
      surface: "reviewer",
      selectedCorpusSource: party1Reviewer?.source,
    });
    assertBoiseNotBoose(party1Html, "party 1 reviewer visible HTML");

    const party2Reviewer = resolveReviewFirstDisplayCorpus(serverDraft, "reviewer");
    assertBoiseNotBoose(party2Reviewer?.text ?? "", "party 2 reviewer document");
    const party2Html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "",
      corpusText: party2Reviewer?.text,
      draft: serverDraft,
      surface: "reviewer",
      selectedCorpusSource: party2Reviewer?.source,
    });
    assertBoiseNotBoose(party2Html, "party 2 reviewer visible HTML");

    const copyExport = resolveReviewFirstDisplayCorpus(serverDraft, "copy_export");
    assertBoiseNotBoose(formatAgreementPlainTextForEditing(copyExport?.text ?? ""), "copy export");

    const downloadTextSource = copyExport?.text.trim() ?? "";
    assertBoiseNotBoose(downloadTextSource, "download/PDF text source");

    const acceptedReviewPlain = resolveAcceptedReviewCorpusFromDraft(serverDraft)?.text ?? "";
    expect(acceptedReviewPlain).toContain(NEW_CITY);

    const vs01Gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: acceptedReviewPlain,
      acceptedReviewPlain,
      draft: serverDraft,
      guidedPro: true,
      premiumComplete: true,
      prepareSignatureLinksRequested: true,
    });
    expect(vs01Gate.allowed).toBe(true);
    expect(["accepted_review", "handoff_corpus"]).toContain(vs01Gate.source);
    assertBoiseNotBoose(vs01Gate.corpus, "VS01 prepare gate corpus");

    const vs01Roles = buildVs01PrepareSigningRoles({
      agreementId: AGREEMENT_ID,
      creatorName: BLUE,
      creatorEmail: "bca342@me.com",
      ownerSignerName: "Sarah Mitchell",
      ownerSignerTitle: "CEO",
      counterparties: [
        { id: "p-iron", name: IRON, email: "ivs345@gmail.com", signerName: "Michael Torres" },
      ],
    });
    const vs01Model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: vs01Gate.corpus,
      draft: serverDraft,
      roles: vs01Roles,
    });
    expect(vs01Model.allowed).toBe(true);
    const vs01Plain = normalizeSigningPacketCorpusLines(vs01Gate.corpus).join("\n");
    assertBoiseNotBoose(vs01Plain, "VS01 signing packet corpus");
    expect(vs01Plain).not.toMatch(/Email for Notice:.*Address for Notice:/);
  });

  it("hard refresh resolves accepted corpus from draft purpose / review_first_final_corpus", () => {
    const corrected = buildCorpus(PARTY1_ADDRESS_NEW);
    const draft = appliedDraft(corrected);
    const accepted = resolveAcceptedReviewCorpusFromDraft(draft);
    expect(accepted?.text).toContain(NEW_CITY);
    expect(accepted?.source).toBe("review_first_final_corpus");
  });

  it("signature-track CTA enabled when proposer changes accepted and other reviewer approved", () => {
    const corrected = buildCorpus(PARTY1_ADDRESS_NEW);
    const draft = appliedDraft(corrected);
    draft.audit_log = [
      ...(draft.audit_log ?? []),
      {
        event_type: "participant_approved",
        at: "2026-06-08T01:30:00.000Z",
        value: { participant_id: "p-iron", message: "approved" },
      },
    ];
    const pres = computeOwnerDoneReviewApprovalPresentation(draft, reviewerRows());
    expect(pres.rowStatuses).toContain("changes_accepted");
    expect(pres.aggregate.allReviewersApproved).toBe(true);
    expect(
      canFinalizeReviewForSigning({
        agreementIdTrimmed: AGREEMENT_ID,
        reviewLinksReady: true,
        anyReviewHref: true,
        linksStillLoading: false,
        linksIncomplete: false,
        reviewApprovalAggregate: pres.aggregate,
      }),
    ).toBe(true);
  });

  it("acceptedProposalCorpusText reads proposal purpose", () => {
    const corrected = buildCorpus(PARTY1_ADDRESS_NEW);
    expect(acceptedProposalCorpusText({ purpose: corrected })).toContain(NEW_CITY);
  });
});
