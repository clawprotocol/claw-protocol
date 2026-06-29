import { beforeEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import {
  buildCanonicalAgreementSnapshot,
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  buildLivePaidProSignerMetadataAuthority,
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { repairGluedSectionHeadingsInText } from "./documentSectionHeadingSplit";
import { stripDuplicateConsecutiveExecutionEntityLines } from "./paidProExecutionBlockEntityHeading";
import {
  countOperativeIfToNoticeStanzas,
  ensureOperativeIfToNoticeDelivery,
  repairIncompleteIfToNoticeStanzas,
} from "./paidProPartyNoticeDetails";
import { commitPaidProPostFinalizeClauseEditRevision } from "./paidProPostFinalizeEditSave";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { markPaidProPipelineValidationPassed, clearPaidProPostAcceptanceValidatorCache } from "./paidProPostAcceptanceValidatorCache";
import {
  createCoordinatorProfile,
  legalPartyIdentitiesExcludingCoordinator,
  normalizePartyIdentities,
} from "./canonicalPartyIdentityModel";
import {
  buildTest468DuplicateExecutionTail,
  buildTest468MalformedNoticesRegion,
  buildTest468UserCorrectedNoticesRegion,
  CEDAR_RIDGE,
  MERIDIAN,
  NORTHSTAR,
  TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
  test468Parties,
} from "./paidProTest468Fixtures";
import { finalizePaidProPostFinalizeClauseEditCorpus } from "./paidProSignerSigningCorpusHygiene";

function test468Authority() {
  return buildLivePaidProSignerMetadataAuthority(
    {
      partyCount: 4,
      recipient1Name: CEDAR_RIDGE,
      recipient2Name: NORTHSTAR,
      recipient1Email: "cryptocurated21+c@gmail.com",
      recipient2Email: "cryptocurated21+n@gmail.com",
      extraPartyReviewEmails: ["cryptocurated21+bh@gmail.com", "cryptocurated21+m@gmail.com"],
      partySignerNames: ["Laura Benton", "Marcus Vale", "Priya Raman", "Daniel Price"],
      partySignerTitles: [
        "Executive Director",
        "Chief Executive Officer",
        "Chief Technology Officer",
        "Managing Director",
      ],
      partyAddresses: [
        "418 Willow Creek Rd., Edmond, OK 73013",
        "215 Innovation Way, Austin, TX 78701",
        "782 Harbor Point Dr., Bellevue, WA 98004",
        "1660 Commerce Blvd., Franklin, TN 37067",
      ],
    },
    "live_ui",
    {
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: [CEDAR_RIDGE, NORTHSTAR],
    },
  );
}

function armFinalizeSnapshot(corpus: string) {
  const authority = test468Authority();
  setConsumedPaidProSignerMetadataAuthority(authority);
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties, {
    intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
    draftPartyNames: [CEDAR_RIDGE, NORTHSTAR],
  });
  createAuthoritativeSigningSnapshot({
    corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
    intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
  });
  setPaidProPinnedSignerAppliedCorpus(corpus);
}

describe("TEST476 repeated notice repair idempotency", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    clearPaidProPostAcceptanceValidatorCache();
  });

  it("repeated notice repair produces identical output with four stanzas and no Party placeholders", () => {
    const parties = test468Parties();
    const roleContext = {
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      draftPartyNames: [CEDAR_RIDGE, NORTHSTAR],
      acceptedCorpus: buildTest468MalformedNoticesRegion(),
    };
    let corpus = repairGluedSectionHeadingsInText(buildTest468MalformedNoticesRegion());

    const first = repairIncompleteIfToNoticeStanzas(corpus, parties, roleContext);
    const second = repairIncompleteIfToNoticeStanzas(first.text, parties, roleContext);
    const third = ensureOperativeIfToNoticeDelivery(second.text, parties, roleContext);
    const fourth = ensureOperativeIfToNoticeDelivery(third.text, parties, roleContext);

    expect(hashPaidProCorpus(second.text)).toBe(hashPaidProCorpus(first.text));
    expect(hashPaidProCorpus(fourth.text)).toBe(hashPaidProCorpus(third.text));
    expect(countOperativeIfToNoticeStanzas(fourth.text)).toBe(4);
    expect(fourth.text).not.toMatch(/If to Party \d/i);
    expect(fourth.text).not.toMatch(/courts12\./i);
    expect((fourth.text.match(/^12\. NOTICES$/gim) ?? []).length).toBeLessThanOrEqual(1);
    expect((fourth.text.match(/Notices under this Agreement must be in writing/gi) ?? []).length).toBe(1);
  });
});

describe("TEST477 post-finalize edit save preserves user notices authority", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    clearPaidProPostAcceptanceValidatorCache();
  });

  it("save keeps user-corrected notices after hydration decorate pass", () => {
    const malformed = buildTest468MalformedNoticesRegion();
    const corrected = buildTest468UserCorrectedNoticesRegion();
    markPaidProPipelineValidationPassed({ text: malformed, source: "server_full_draft_retry" });
    establishPaidProSourceOfTruth({
      text: malformed,
      source: "server_full_draft",
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    const snap = buildCanonicalAgreementSnapshot({
      surface: "test477",
      tier: "pro",
      candidates: [{ source: "server_full_document_text", text: malformed }],
      parties: [
        { name: CEDAR_RIDGE, role: "Client" },
        { name: NORTHSTAR, role: "Service Provider" },
      ],
      minLen: 500,
    });
    freezeCanonicalAgreementSnapshot(snap, "server_full_document_text");

    const authority = test468Authority();
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: malformed,
      authority,
      intakeRaw: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      surface: "test477_finalize",
      signatureRegionOnly: true,
      repairRecital: false,
    });
    armFinalizeSnapshot(hydrated.corpus);

    const saved = commitPaidProPostFinalizeClauseEditRevision({
      editedPlain: corrected,
      roleContext: {
        intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
        draftPartyNames: [CEDAR_RIDGE, NORTHSTAR],
      },
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    expect(saved.corpus).toMatch(/12\. Notices and Miscellaneous/i);
    expect(saved.corpus).not.toMatch(/courts12\./i);
    expect(saved.corpus).not.toMatch(/\nNotices\n\nAny notice under this Agreement must be in writing and will be deemed given when delivered personally/i);
    expect(saved.corpus).toMatch(/Laura Benton/i);
    expect(saved.corpus).toMatch(/Marcus Vale/i);
    expect(readAuthoritativeSigningCorpus()).toBe(saved.corpus);

    const reviewPlain = resolvePaidProPostFinalizeReviewPlain();
    expect(reviewPlain).toMatch(/12\. Notices and Miscellaneous/i);
    expect(reviewPlain).not.toMatch(/courts12\./i);
    expect(hashPaidProCorpus(reviewPlain)).toBe(saved.corpusHash);
  });
});

describe("TEST478 execution block single entity heading per signer", () => {
  it("strips duplicate consecutive legal entity lines in execution tail", () => {
    const corpus = buildTest468DuplicateExecutionTail();
    const deduped = stripDuplicateConsecutiveExecutionEntityLines(corpus);
    expect(deduped.repairs.length).toBeGreaterThan(0);
    const witnessIdx = deduped.text.search(/\bIN WITNESS WHEREOF\b/i);
    const tail = deduped.text.slice(witnessIdx);
    const cedarMatches = tail.match(new RegExp(CEDAR_RIDGE.replace(/\./g, "\\."), "g")) ?? [];
    expect(cedarMatches.length).toBe(1);
  });

  it("post-finalize clause edit finalize path dedupes execution entity headings", () => {
    const parties = test468Parties();
    const finalized = finalizePaidProPostFinalizeClauseEditCorpus(
      buildTest468DuplicateExecutionTail(),
      parties,
      { intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE },
    );
    const witnessIdx = finalized.text.search(/\bIN WITNESS WHEREOF\b/i);
    const tail = finalized.text.slice(witnessIdx);
    for (const legal of [CEDAR_RIDGE, NORTHSTAR, MERIDIAN]) {
      const escaped = legal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const consecutive = new RegExp(`${escaped}\\s*\\n\\s*${escaped}`, "i");
      expect(tail).not.toMatch(consecutive);
      const occurrences = tail.match(new RegExp(escaped, "gi")) ?? [];
      expect(occurrences.length).toBe(1);
    }
  });
});

describe("TEST479 coordinator never appears as agreement party", () => {
  it("excludes coordinator from legal party identities and notice authority parties", () => {
    const coordinator = createCoordinatorProfile({
      isUser: true,
      email: "paige.orchestrator@coord.example.com",
      displayName: "Paige Orchestrator",
      userRelation: "coordinator",
    });
    const parties = normalizePartyIdentities({
      intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE,
      userIsCoordinatorOnly: true,
      coordinator,
      authorityParties: test468Parties(),
    });
    const legal = legalPartyIdentitiesExcludingCoordinator(parties, coordinator, true);
    expect(legal.length).toBe(4);
    expect(legal.some((p) => /coordinator|paige orchestrator/i.test(p.legalName))).toBe(false);

    const noticeDelivery = ensureOperativeIfToNoticeDelivery(
      buildTest468MalformedNoticesRegion(),
      test468Parties(),
      { intakeText: TEST468_PRODUCTION_QUAD_PARTY_INTAKE },
    );
    expect(countOperativeIfToNoticeStanzas(noticeDelivery.text)).toBe(4);
    expect(noticeDelivery.text).not.toMatch(/If to Paige Orchestrator/i);
    expect(noticeDelivery.text).not.toMatch(/If to Coordinator/i);
  });
});
